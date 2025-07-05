
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleAccount, DriveFile } from "@/types/auth";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";

interface FileExplorerProps {
  accounts: GoogleAccount[];
}

export const FileExplorer = ({ accounts }: FileExplorerProps) => {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  // Mock files for demonstration
  const mockFiles: DriveFile[] = [
    {
      id: "1",
      name: "Project Presentation.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 2048000,
      createdTime: "2024-01-15T10:30:00Z",
      modifiedTime: "2024-01-15T10:30:00Z",
      accountId: accounts[0]?.id || "account1"
    },
    {
      id: "2",
      name: "Meeting Notes.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: 512000,
      createdTime: "2024-01-14T14:20:00Z",
      modifiedTime: "2024-01-14T14:20:00Z",
      accountId: accounts[0]?.id || "account1"
    },
    {
      id: "3",
      name: "Budget Spreadsheet.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 1024000,
      createdTime: "2024-01-13T09:15:00Z",
      modifiedTime: "2024-01-13T09:15:00Z",
      accountId: accounts[1]?.id || "account2"
    }
  ];

  const displayFiles = accounts.length > 0 ? mockFiles : [];
  const filteredFiles = displayFiles.filter(file => 
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || accounts.length === 0) return;

    setUploading(true);
    
    // Mock upload process
    setTimeout(() => {
      const newFile: DriveFile = {
        id: `file_${Date.now()}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        accountId: accounts[0].id
      };
      
      setFiles(prev => [...prev, newFile]);
      setUploading(false);
      
      toast({
        title: "File Uploaded",
        description: `Successfully uploaded ${file.name}`,
      });
    }, 2000);
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">File Explorer</h2>
        <p className="text-gray-600">Browse and manage files across all your connected Google Drive accounts</p>
      </div>

      {accounts.length === 0 ? (
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
      ) : (
        <>
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

          <div className="grid gap-4">
            {filteredFiles.map((file) => (
              <Card key={file.id} className="hover:shadow-md transition-shadow">
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
                      <Button variant="outline" size="sm">
                        Download
                      </Button>
                      <Button variant="outline" size="sm">
                        Share
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredFiles.length === 0 && searchTerm && (
            <Card className="text-center p-8">
              <CardContent className="pt-6">
                <p className="text-gray-600">No files found matching "{searchTerm}"</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
