import "../styles/global.css";
import "../styles/file-explorer.css";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes } from "@/utils/formatBytes";
import { useToast } from "@/hooks/use-toast";
import { DriveService, DriveFile } from "@/services/driveService";
import { GoogleAccount } from "@/services/googleAuth";
import { DriveTree } from "./DriveTree";
import { FilePreview } from "./FilePreview";
import { GooglePhotosTree } from "./GooglePhotosTree";
import { Eye, Download } from "lucide-react";

interface FileExplorerProps {
  accounts: GoogleAccount[];
}

export const FileExplorer = ({ accounts }: FileExplorerProps) => {
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [targetAccount, setTargetAccount] = useState<string>("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [largeFiles, setLargeFiles] = useState<DriveFile[]>([]);
  const [largePhotos, setLargePhotos] = useState<DriveFile[]>([]);
  const [loadingLargeFiles, setLoadingLargeFiles] = useState(false);
  const [loadingLargePhotos, setLoadingLargePhotos] = useState(false);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const [driveService] = useState(new DriveService());

  useEffect(() => {
    if (accounts.length > 0) {
      loadLargeFiles();
      loadLargePhotos();
    }
  }, [accounts, refreshTrigger]);

  const loadLargeFiles = async () => {
    const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
    if (!primaryAccount) return;

    setLoadingLargeFiles(true);
    try {
      const files = await driveService.getFiles(primaryAccount.id);
      const sortedFiles = files
        .filter(file => file.mimeType !== 'application/vnd.google-apps.folder')
        .sort((a, b) => (b.size || 0) - (a.size || 0))
        .slice(0, 20);
      setLargeFiles(sortedFiles);
    } catch (error) {
      console.error('Error loading large files:', error);
    } finally {
      setLoadingLargeFiles(false);
    }
  };

  const loadLargePhotos = async () => {
    const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
    if (!primaryAccount) return;

    setLoadingLargePhotos(true);
    try {
      const photos = await driveService.getGooglePhotos(primaryAccount.id);
      const sortedPhotos = photos
        .sort((a, b) => (b.size || 0) - (a.size || 0))
        .slice(0, 20);
      setLargePhotos(sortedPhotos);
    } catch (error) {
      console.error('Error loading large photos:', error);
    } finally {
      setLoadingLargePhotos(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || accounts.length === 0) return;

    setUploading(true);
    
    try {
      const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
      if (primaryAccount) {
        await driveService.checkStorageAndAutoMove(primaryAccount.id);
      }

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

  const handleMoveSelectedFiles = async () => {
    if (selectedFiles.length === 0 || !targetAccount) return;

    const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
    const backupAccount = accounts.find(acc => acc.id === targetAccount);
    
    if (!primaryAccount || !backupAccount) return;

    try {
      for (const fileId of selectedFiles) {
        await driveService.moveFileWithPath(
          fileId, 
          primaryAccount.id, 
          targetAccount, 
          backupAccount.sharedFolderId || '', 
          true
        );
      }
      
      setSelectedFiles([]);
      setTargetAccount("");
      setRefreshTrigger(prev => prev + 1);
      
      toast({
        title: "Files Moved",
        description: `Successfully moved ${selectedFiles.length} files to backup account`,
      });
    } catch (error) {
      toast({
        title: "Move Failed",
        description: "Failed to move some files",
        variant: "destructive"
      });
    }
  };

  const handleMoveSelectedPhotos = async () => {
    if (selectedPhotos.length === 0 || !targetAccount) return;

    const primaryAccount = accounts.find(acc => acc.accountType === 'primary');
    const backupAccount = accounts.find(acc => acc.id === targetAccount);
    
    if (!primaryAccount || !backupAccount) return;

    try {
      for (const photoId of selectedPhotos) {
        await driveService.movePhotoWithMetadata(
          photoId, 
          primaryAccount.id, 
          targetAccount, 
          backupAccount.sharedFolderId || '', 
          true
        );
      }
      
      setSelectedPhotos([]);
      setTargetAccount("");
      setRefreshTrigger(prev => prev + 1);
      
      toast({
        title: "Photos Moved",
        description: `Successfully moved ${selectedPhotos.length} photos to backup account`,
      });
    } catch (error) {
      toast({
        title: "Move Failed",
        description: "Failed to move some photos",
        variant: "destructive"
      });
    }
  };

  const handleFilePreview = (file: DriveFile) => {
    setPreviewFile(file);
    setShowPreview(true);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (accounts.length === 0) {
    return (
      <div className="file-explorer-container container-responsive">
        <div className="file-explorer-header">
          <h2 className="file-explorer-title">File Explorer</h2>
          <p className="file-explorer-subtitle">Browse and manage files across all your connected Google Drive accounts</p>
        </div>

        <Card className="text-center p-6 sm:p-8">
          <CardContent className="pt-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-xl sm:text-2xl">📁</span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold mb-2">No Files Available</h3>
            <p className="text-gray-600 text-sm sm:text-base">
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
    <div className="file-explorer-container container-responsive">
      <div className="file-explorer-header">
        <h2 className="file-explorer-title">File Explorer</h2>
        <p className="file-explorer-subtitle">Browse and manage files across all your connected Google Drive accounts</p>
      </div>

      <Tabs defaultValue="files" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="files">Files & Folders</TabsTrigger>
          <TabsTrigger value="photos">Google Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4 sm:space-y-6">
          <Card className="file-operations-card">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">File Operations</CardTitle>
            </CardHeader>
            <CardContent className="file-operations-content">
              <div className="file-operations-buttons">
                <div className="upload-button-container">
                  <Input
                    type="file"
                    onChange={handleFileUpload}
                    className="upload-input"
                    disabled={uploading}
                  />
                  <Button disabled={uploading} className="button-responsive mobile-full-width">
                    {uploading ? "Uploading..." : "Upload File"}
                  </Button>
                </div>
                <Button onClick={handleRefresh} variant="outline" className="button-responsive mobile-full-width">
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="drive-grid">
            {primaryAccount && (
              <div className="drive-section">
                <h3 className="drive-section-title">Primary Account</h3>
                <DriveTree 
                  key={`${primaryAccount.id}-${refreshTrigger}`}
                  account={primaryAccount} 
                  isBackup={false}
                  onRefresh={handleRefresh}
                  onFilePreview={handleFilePreview}
                />
              </div>
            )}

            {backupAccounts.length > 0 && (
              <div className="drive-section">
                <h3 className="drive-section-title">Backup Accounts</h3>
                <div className="backup-accounts-container">
                  {backupAccounts.map(account => (
                    <DriveTree 
                      key={`${account.id}-${refreshTrigger}`}
                      account={account} 
                      isBackup={true}
                      onFileMove={handleFileMove}
                      onRefresh={handleRefresh}
                      onFilePreview={handleFilePreview}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {primaryAccount && (
            <div className="large-files-section">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Largest Files (Primary Account)</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingLargeFiles ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm">Loading files...</p>
                    </div>
                  ) : (
                    <>
                      <div className="large-files-grid">
                        {largeFiles.map(file => (
                          <div
                            key={file.id}
                            className={`file-card ${selectedFiles.includes(file.id) ? 'file-card-selected' : ''}`}
                            onClick={() => {
                              setSelectedFiles(prev => 
                                prev.includes(file.id) 
                                  ? prev.filter(id => id !== file.id)
                                  : [...prev, file.id]
                              );
                            }}
                          >
                            <div className="file-card-content">
                              <div className="flex items-center gap-2">
                                {file.thumbnailUrl ? (
                                  <img 
                                    src={file.thumbnailUrl} 
                                    alt={file.name}
                                    className="file-thumbnail"
                                  />
                                ) : (
                                  <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-200 rounded flex-shrink-0"></div>
                                )}
                                <span className="file-card-name">{file.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-1 h-6 w-6 ml-auto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilePreview(file);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="file-card-size">{formatBytes(file.size || 0)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {selectedFiles.length > 0 && (
                        <div className="move-files-section">
                          <Select value={targetAccount} onValueChange={setTargetAccount}>
                            <SelectTrigger className="w-full sm:w-64">
                              <SelectValue placeholder="Select backup account" />
                            </SelectTrigger>
                            <SelectContent>
                              {backupAccounts.map(account => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button 
                            onClick={handleMoveSelectedFiles}
                            disabled={!targetAccount}
                            className="button-responsive mobile-full-width"
                          >
                            Move {selectedFiles.length} Files
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="space-y-4 sm:space-y-6">
          <Card className="file-operations-card">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Google Photos Operations</CardTitle>
            </CardHeader>
            <CardContent className="file-operations-content">
              <div className="file-operations-buttons">
                <Button onClick={handleRefresh} variant="outline" className="button-responsive mobile-full-width">
                  Refresh Photos
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="drive-grid">
            {primaryAccount && (
              <div className="drive-section">
                <h3 className="drive-section-title">Primary Account Photos</h3>
                <GooglePhotosTree 
                  key={`photos-${primaryAccount.id}-${refreshTrigger}`}
                  account={primaryAccount} 
                  isBackup={false}
                  onRefresh={handleRefresh}
                  onFilePreview={handleFilePreview}
                />
              </div>
            )}

            {backupAccounts.length > 0 && (
              <div className="drive-section">
                <h3 className="drive-section-title">Backup Account Photos</h3>
                <div className="backup-accounts-container">
                  {backupAccounts.map(account => (
                    <GooglePhotosTree 
                      key={`photos-${account.id}-${refreshTrigger}`}
                      account={account} 
                      isBackup={true}
                      onRefresh={handleRefresh}
                      onFilePreview={handleFilePreview}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {primaryAccount && (
            <div className="large-files-section">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base sm:text-lg">Largest Photos (Primary Account)</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingLargePhotos ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm">Loading photos...</p>
                    </div>
                  ) : (
                    <>
                      <div className="large-files-grid">
                        {largePhotos.map(photo => (
                          <div
                            key={photo.id}
                            className={`file-card ${selectedPhotos.includes(photo.id) ? 'file-card-selected' : ''}`}
                            onClick={() => {
                              setSelectedPhotos(prev => 
                                prev.includes(photo.id) 
                                  ? prev.filter(id => id !== photo.id)
                                  : [...prev, photo.id]
                              );
                            }}
                          >
                            <div className="file-card-content">
                              <div className="flex items-center gap-2">
                                {photo.thumbnailUrl ? (
                                  <img 
                                    src={photo.thumbnailUrl} 
                                    alt={photo.name}
                                    className="file-thumbnail"
                                  />
                                ) : (
                                  <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-200 rounded flex-shrink-0"></div>
                                )}
                                <span className="file-card-name">{photo.name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-1 h-6 w-6 ml-auto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilePreview(photo);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="file-card-size">{formatBytes(photo.size || 0)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {selectedPhotos.length > 0 && (
                        <div className="move-files-section">
                          <Select value={targetAccount} onValueChange={setTargetAccount}>
                            <SelectTrigger className="w-full sm:w-64">
                              <SelectValue placeholder="Select backup account" />
                            </SelectTrigger>
                            <SelectContent>
                              {backupAccounts.map(account => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button 
                            onClick={handleMoveSelectedPhotos}
                            disabled={!targetAccount}
                            className="button-responsive mobile-full-width"
                          >
                            Move {selectedPhotos.length} Photos
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {showPreview && previewFile && (
        <FilePreview 
          file={previewFile}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
};
