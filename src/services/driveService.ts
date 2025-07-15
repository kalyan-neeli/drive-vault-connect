
import { supabase } from '@/integrations/supabase/client';
import { GoogleAuthService } from './googleAuth';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  accountId: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
}

export class DriveService {
  private authService = new GoogleAuthService();

  async getFiles(accountId: string, folderId?: string): Promise<DriveFile[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get valid access token (will refresh if needed)
    const accessToken = await this.authService.ensureValidToken(accountId);

    // Get account details
    const { data: account, error: accountError } = await supabase
      .from('google_accounts')
      .select('account_type, shared_folder_id')
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId)
      .single();

    if (accountError) throw accountError;

    // For backup accounts, only show files from shared folder
    let query = 'https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink)';
    if (account.account_type === 'backup' && account.shared_folder_id) {
      query += `&q='${account.shared_folder_id}' in parents`;
    } else if (folderId) {
      query += `&q='${folderId}' in parents`;
    }

    // Fetch files from Google Drive API
    try {
      const response = await fetch(query, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch files from Google Drive');
      }

      const data = await response.json();
      
      const files: DriveFile[] = data.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0'),
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        accountId: accountId,
        downloadUrl: file.webViewLink,
        thumbnailUrl: file.thumbnailLink
      }));

      // Store files in database for caching
      await this.syncFilesToDatabase(files, accountId);

      return files;
    } catch (error) {
      console.error('Error fetching files:', error);
      // Fallback to cached files from database
      return this.getCachedFiles(accountId);
    }
  }

  private async syncFilesToDatabase(files: DriveFile[], accountId: string) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const { data: googleAccount } = await supabase
      .from('google_accounts')
      .select('id')
      .eq('google_account_id', accountId)
      .single();

    if (!googleAccount) return;

    for (const file of files) {
      await supabase
        .from('drive_files')
        .upsert({
          user_id: user.user.id,
          google_account_id: googleAccount.id,
          drive_file_id: file.id,
          name: file.name,
          mime_type: file.mimeType,
          size: file.size,
          created_time: file.createdTime,
          modified_time: file.modifiedTime,
          download_url: file.downloadUrl,
          thumbnail_url: file.thumbnailUrl,
          synced_at: new Date().toISOString()
        });
    }
  }

  private async getCachedFiles(accountId: string): Promise<DriveFile[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return [];

    const { data: googleAccount } = await supabase
      .from('google_accounts')
      .select('id')
      .eq('google_account_id', accountId)
      .single();

    if (!googleAccount) return [];

    const { data, error } = await supabase
      .from('drive_files')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('google_account_id', googleAccount.id)
      .eq('is_deleted', false);

    if (error) return [];

    return data.map(file => ({
      id: file.drive_file_id,
      name: file.name,
      mimeType: file.mime_type,
      size: file.size || 0,
      createdTime: file.created_time || '',
      modifiedTime: file.modified_time || '',
      accountId: accountId,
      downloadUrl: file.download_url,
      thumbnailUrl: file.thumbnail_url
    }));
  }

  async uploadFile(file: File, accountId?: string, targetFolderId?: string): Promise<DriveFile> {
    // If no account specified, choose the best backup account
    if (!accountId) {
      accountId = await this.selectBestBackupAccount();
    }

    // Get valid access token (will refresh if needed)
    const accessToken = await this.authService.ensureValidToken(accountId);

    const { data: account, error } = await supabase
      .from('google_accounts')
      .select('account_type, shared_folder_id')
      .eq('google_account_id', accountId)
      .single();

    if (error) throw error;

    // For backup accounts, upload to shared folder
    let parentFolderId = targetFolderId;
    if (account.account_type === 'backup' && account.shared_folder_id && !targetFolderId) {
      parentFolderId = account.shared_folder_id;
    }

    const metadata: any = {
      name: file.name,
      mimeType: file.type
    };

    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        body: form
      }
    );

    if (!response.ok) {
      throw new Error('Failed to upload file to Google Drive');
    }

    const uploadedFile = await response.json();
    
    return {
      id: uploadedFile.id,
      name: uploadedFile.name,
      mimeType: uploadedFile.mimeType,
      size: parseInt(uploadedFile.size || '0'),
      createdTime: uploadedFile.createdTime,
      modifiedTime: uploadedFile.modifiedTime,
      accountId: accountId
    };
  }

  async selectBestBackupAccount(): Promise<string> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: backupAccounts } = await supabase
      .from('google_accounts')
      .select('google_account_id, total_storage, used_storage')
      .eq('user_id', user.user.id)
      .eq('account_type', 'backup')
      .eq('status', 'active');

    if (!backupAccounts || backupAccounts.length === 0) {
      throw new Error('No backup accounts available');
    }

    // Find account with most available storage
    const accountsWithFreeSpace = backupAccounts
      .map(acc => ({
        ...acc,
        freeSpace: (acc.total_storage || 0) - (acc.used_storage || 0)
      }))
      .filter(acc => acc.freeSpace > 0)
      .sort((a, b) => b.freeSpace - a.freeSpace);

    if (accountsWithFreeSpace.length === 0) {
      throw new Error('No backup accounts with available storage');
    }

    // If multiple accounts have same free space, choose randomly
    const maxFreeSpace = accountsWithFreeSpace[0].freeSpace;
    const topAccounts = accountsWithFreeSpace.filter(acc => acc.freeSpace === maxFreeSpace);
    
    return topAccounts[Math.floor(Math.random() * topAccounts.length)].google_account_id;
  }

  async getLargestFiles(accountId: string, limit: number = 10): Promise<DriveFile[]> {
    const files = await this.getFiles(accountId);
    return files
      .filter(file => file.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  async moveFileToBackup(fileId: string, sourceAccountId: string, targetAccountId?: string, maintainPath?: boolean): Promise<void> {
    if (!targetAccountId) {
      targetAccountId = await this.selectBestBackupAccount();
    }

    // Get valid access tokens (will refresh if needed)
    const sourceAccessToken = await this.authService.ensureValidToken(sourceAccountId);
    const targetAccessToken = await this.authService.ensureValidToken(targetAccountId);

    const { data: targetAccount } = await supabase
      .from('google_accounts')
      .select('shared_folder_id')
      .eq('google_account_id', targetAccountId)
      .single();

    if (!targetAccount) throw new Error('Target account not found');

    // Get file metadata from source
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,parents`, {
      headers: { 'Authorization': `Bearer ${sourceAccessToken}` }
    });
    
    const fileMetadata = await fileResponse.json();

    // Download file content
    const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${sourceAccessToken}` }
    });
    
    const fileBlob = await downloadResponse.blob();

    // Create folder structure in backup if needed
    let targetFolderId = targetAccount.shared_folder_id;
    if (maintainPath && fileMetadata.parents) {
      targetFolderId = await this.recreateFolderStructure(
        fileMetadata.parents[0], 
        sourceAccessToken, 
        targetAccessToken,
        targetAccount.shared_folder_id
      );
    }

    // Upload to target account
    const uploadMetadata: any = {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType
    };

    if (targetFolderId) {
      uploadMetadata.parents = [targetFolderId];
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(uploadMetadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${targetAccessToken}` },
        body: form
      }
    );

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file to backup account');
    }

    // Delete from source account
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${sourceAccessToken}` }
    });
  }

  private async recreateFolderStructure(
    parentFolderId: string, 
    sourceToken: string, 
    targetToken: string, 
    rootTargetFolder: string
  ): Promise<string> {
    // Get parent folder path from source
    const folderResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${parentFolderId}?fields=name,parents`, {
      headers: { 'Authorization': `Bearer ${sourceToken}` }
    });
    
    const folderData = await folderResponse.json();
    
    // Create folder in target account under shared folder
    const folderMetadata = {
      name: folderData.name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootTargetFolder]
    };

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${targetToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(folderMetadata)
    });

    const newFolder = await createResponse.json();
    return newFolder.id;
  }

  async checkStorageAndAutoMove(primaryAccountId: string): Promise<void> {
    const { data: primaryAccount } = await supabase
      .from('google_accounts')
      .select('total_storage, used_storage')
      .eq('google_account_id', primaryAccountId)
      .single();

    if (!primaryAccount) return;

    const freeSpace = (primaryAccount.total_storage || 0) - (primaryAccount.used_storage || 0);
    const storageThreshold = (primaryAccount.total_storage || 0) * 0.1; // 10% threshold

    if (freeSpace < storageThreshold) {
      // Get largest files and move them
      const largestFiles = await this.getLargestFiles(primaryAccountId, 5);
      
      for (const file of largestFiles) {
        try {
          await this.moveFileToBackup(file.id, primaryAccountId, undefined, true);
        } catch (error) {
          console.error(`Failed to move file ${file.name}:`, error);
        }
      }
    }
  }
}
