
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";

interface FileExplorerProps {
  accounts: GoogleAccount[];
}

export const FileExplorer = ({ accounts }: FileExplorerProps) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [driveService] = useState(new DriveService());

  useEffect(() => {
    if (accounts.length > 0) {
      loadFiles();
    }
  }, [accounts]);

  const loadFiles = async () => {
    if (accounts.length === 0) return;
    
    setLoading(true);
    try {
      const allFiles: DriveFile[] = [];
      
      for (const account of accounts) {
        const accountFiles = await driveService.getFiles(account.id);
        allFiles.push(...accountFiles);
      }
      
      setFiles(allFiles);
    } catch (error) {
      console.error('Error loading files:', error);
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredFiles = files.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || accounts.length === 0) return;

    setUploading(true);
    
    try {
      await driveService.uploadFile(file, accounts[0].id);
      await loadFiles(); // Refresh file list
      
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

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('document')) return '📝';
    if (mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('presentation')) return '📽️';
    return '📁';
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find(acc => acc.id === accountId);
    return account?.email || 'Unknown Account';
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
            <Input
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
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
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="text-center p-8">
          <CardContent className="pt-6">
            <p className="text-gray-600">Loading files...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredFiles.map((file) => (
            <Card key={`${file.accountId}-${file.id}`} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl">
                      {getFileIcon(file.mimeType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{file.name}</h4>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>{formatBytes(file.size)}</span>
                        <span>{getAccountName(file.accountId)}</span>
                        <span>{new Date(file.modifiedTime).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {file.downloadUrl && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.open(file.downloadUrl, '_blank')}
                      >
                        View
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredFiles.length === 0 && searchTerm && !loading && (
        <Card className="text-center p-8">
          <CardContent className="pt-6">
            <p className="text-gray-600">No files found matching "{searchTerm}"</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
