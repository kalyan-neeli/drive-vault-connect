
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";
import { DriveTree } from "./DriveTree";

interface FileExplorerProps {
  accounts: GoogleAccount[];
}

export const FileExplorer = ({ accounts }: FileExplorerProps) => {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [targetAccount, setTargetAccount] = useState<string>("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { toast } = useToast();
  const [driveService] = useState(new DriveService());

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || accounts.length === 0) return;

    setUploading(true);
    
    try {
      // Check primary account storage and auto-move files if needed
      const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
      if (primaryAccount) {
        await driveService.checkStorageAndAutoMove(primaryAccount.id);
      }

      // Upload using smart account selection
      await driveService.uploadFile(file);
      setRefreshTrigger(prev => prev + 1);
      
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded ${file.name}`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload file",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileMove = async (fileId: string, targetFolderId: string, targetAccountId: string) => {
    const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
    if (!primaryAccount) return;

    try {
      await driveService.moveFileWithPath(fileId, primaryAccount.id, targetAccountId, targetFolderId, true);
      setRefreshTrigger(prev => prev + 1);
      
      toast({
        title: "File Moved",
        description: "Successfully moved file to backup account",
      });
    } catch (error) {
      toast({
        title: "Move Failed",
        description: error instanceof Error ? error.message : "Failed to move file",
        variant: "destructive"
      });
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">File Explorer</h2>
          <p className="text-gray-600">Browse and manage files across all your connected Google Drive accounts</p>
        </div>

        <Card className="text-center p-8">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">📁</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">No Files Available</h3>
            <p className="text-gray-600">
              Connect Google accounts to view and manage your files
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
  const backupAccounts = accounts.filter(acc => acc.accountType === 'backup');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">File Explorer</h2>
        <p className="text-gray-600">Browse and manage files across all your connected Google Drive accounts</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="relative">
              <Input
                type="file"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={uploading}
              />
              <Button disabled={uploading}>
                {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </div>
            <Button onClick={handleRefresh} variant="outline">
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {primaryAccount && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Primary Account</h3>
            <DriveTree 
              key={`${primaryAccount.id}-${refreshTrigger}`}
              account={primaryAccount} 
              isBackup={false}
              onRefresh={handleRefresh}
            />
          </div>
        )}

        {backupAccounts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Backup Accounts</h3>
            <div className="space-y-4">
              {backupAccounts.map(account => (
                <DriveTree 
                  key={`${account.id}-${refreshTrigger}`}
                  account={account} 
                  isBackup={true}
                  onFileMove={handleFileMove}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Drag & Drop Instructions:</h4>
        <ul className="space-y-1">
          <li>• Drag files from Primary account to Backup account folders to move them</li>
          <li>• Folder structure will be maintained when moving files</li>
          <li>• Duplicate file names in the same folder are not allowed</li>
          <li>• Use the + button to create new folders</li>
          <li>• Use the trash button to delete files or folders</li>
        </ul>
      </div>
    </div>
  );
};
