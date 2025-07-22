import "../styles/global.css";
import "../styles/file-explorer.css";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GoogleAccount } from "@/services/googleAuth";
import { DriveTree } from "./DriveTree";
import { AccountManager } from "./AccountManager";
import { FilePreview } from "./FilePreview";
import { GooglePhotosTree } from "./GooglePhotosTree";
import { LargestFilesView } from "./LargestFilesView";
import { DriveFile } from "@/services/driveService";

interface FileExplorerProps {
  accounts: GoogleAccount[];
}

export const FileExplorer = ({ accounts }: FileExplorerProps) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'photos' | 'largest'>('drive');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Handle tab change to trigger fresh data loading
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'drive' | 'photos' | 'largest');
    // Increment trigger to force refresh of components
    setRefreshTrigger(prev => prev + 1);
  };

  const primaryAccounts = accounts.filter(acc => acc.accountType === 'primary');
  const backupAccounts = accounts.filter(acc => acc.accountType === 'backup');

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">File Explorer</h2>
          <p className="text-gray-600">Browse and manage files across your Google Drive accounts</p>
        </div>

        <Card className="text-center p-8">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-2xl">📁</span>
            </div>
            <h3 className="text-xl font-semibold mb-2">No Files Available</h3>
            <p className="text-gray-600 mb-4">
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">File Explorer</h2>
        <p className="text-gray-600">Browse and manage files across your Google Drive accounts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {accounts.map((account) => (
          <Card key={account.id} className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center space-x-3">
                {account.avatar ? (
                  <img 
                    src={account.avatar} 
                    alt={account.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {account.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold truncate">{account.name}</h3>
                  <p className="text-sm text-gray-600 truncate">{account.email}</p>
                  <p className="text-xs text-gray-500">
                    {account.accountType === 'primary' ? 'Primary Account' : 'Backup Account'}
                  </p>
                </div>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <Tabs 
                value={activeTab} 
                onValueChange={handleTabChange}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="drive">Drive Files</TabsTrigger>
                  <TabsTrigger value="photos">Photos</TabsTrigger>
                  <TabsTrigger value="largest">Largest Files</TabsTrigger>
                </TabsList>

                <TabsContent value="drive" className="mt-6">
                  <DriveTree 
                    account={account} 
                    key={`${account.id}-${activeTab}-${refreshTrigger}`}
                    onFileSelect={setSelectedFile}
                  />
                </TabsContent>

                <TabsContent value="photos" className="mt-6">
                  <GooglePhotosTree 
                    account={account} 
                    key={`photos-${account.id}-${activeTab}-${refreshTrigger}`}
                    onFilePreview={setSelectedFile}
                  />
                </TabsContent>

                <TabsContent value="largest" className="mt-6">
                  {account.accountType === 'primary' && (
                    <LargestFilesView 
                      primaryAccount={account}
                      backupAccounts={accounts.filter(acc => acc.accountType === 'backup')}
                      key={`largest-${account.id}-${activeTab}-${refreshTrigger}`}
                    />
                  )}
                  {account.accountType === 'backup' && (
                    <div className="text-center py-8 text-gray-500">
                      <p>Largest files view is only available for primary accounts</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedFile && (
        <Dialog open={true} onOpenChange={() => setSelectedFile(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <FilePreview
              file={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};