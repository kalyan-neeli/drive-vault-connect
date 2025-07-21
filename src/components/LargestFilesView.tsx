import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { File, MoveRight } from "lucide-react";

interface LargestFilesViewProps {
  primaryAccount: GoogleAccount;
  backupAccounts: GoogleAccount[];
}

export const LargestFilesView = ({ primaryAccount, backupAccounts }: LargestFilesViewProps) => {
  const [largestFiles, setLargestFiles] = useState<DriveFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [targetAccountId, setTargetAccountId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState({ completed: 0, total: 0 });
  const { toast } = useToast();
  const driveService = new DriveService();

  useEffect(() => {
    loadLargestFiles();
  }, [primaryAccount]);

  const loadLargestFiles = async () => {
    if (!primaryAccount) return;
    
    setIsLoading(true);
    try {
      const files = await driveService.getLargestFiles(primaryAccount.id, 100);
      setLargestFiles(files);
    } catch (error) {
      console.error('Error loading largest files:', error);
      toast({
        title: "Error",
        description: "Failed to load largest files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = (fileId: string, checked: boolean) => {
    const newSelected = new Set(selectedFiles);
    if (checked) {
      newSelected.add(fileId);
    } else {
      newSelected.delete(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(new Set(largestFiles.map(f => f.id)));
    } else {
      setSelectedFiles(new Set());
    }
  };

  const handleTransferFiles = async () => {
    if (selectedFiles.size === 0 || !targetAccountId) {
      toast({
        title: "Error",
        description: "Please select files and target account",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    setTransferProgress({ completed: 0, total: selectedFiles.size });

    try {
      // Get target account shared folder
      const targetAccount = backupAccounts.find(acc => acc.id === targetAccountId);
      if (!targetAccount?.sharedFolderId) {
        throw new Error('Target account shared folder not found');
      }

      const fileIds = Array.from(selectedFiles);
      await driveService.moveFilesInBatch(
        fileIds,
        primaryAccount.id,
        targetAccountId,
        targetAccount.sharedFolderId,
        (completed, total) => {
          setTransferProgress({ completed, total });
        }
      );

      toast({
        title: "Success",
        description: `Successfully moved ${selectedFiles.size} files to backup account`,
      });

      // Refresh the largest files list
      await loadLargestFiles();
      setSelectedFiles(new Set());
    } catch (error) {
      console.error('Error transferring files:', error);
      toast({
        title: "Error",
        description: "Failed to transfer files",
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
      setTransferProgress({ completed: 0, total: 0 });
    }
  };

  const progressPercentage = transferProgress.total > 0 
    ? (transferProgress.completed / transferProgress.total) * 100 
    : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading largest files...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <File className="h-5 w-5" />
          Top 100 Largest Files in {primaryAccount.name}
        </CardTitle>
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="select-all"
              checked={selectedFiles.size === largestFiles.length && largestFiles.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <label htmlFor="select-all" className="text-sm font-medium">
              Select All ({selectedFiles.size} selected)
            </label>
          </div>
          
          <Select value={targetAccountId} onValueChange={setTargetAccountId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select backup account" />
            </SelectTrigger>
            <SelectContent>
              {backupAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleTransferFiles}
            disabled={selectedFiles.size === 0 || !targetAccountId || isTransferring}
            className="flex items-center gap-2"
          >
            <MoveRight className="h-4 w-4" />
            Move Selected ({selectedFiles.size})
          </Button>
        </div>

        {isTransferring && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Transferring files...</span>
              <span>{transferProgress.completed} of {transferProgress.total}</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {largestFiles.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No large files found</p>
          ) : (
            largestFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-gray-50"
              >
                <Checkbox
                  checked={selectedFiles.has(file.id)}
                  onCheckedChange={(checked) => handleSelectFile(file.id, checked as boolean)}
                />
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-sm text-gray-500">{file.mimeType}</p>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-orange-600">{formatBytes(file.size)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(file.createdTime).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};