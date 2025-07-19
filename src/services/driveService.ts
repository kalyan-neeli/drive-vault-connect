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
  parentId?: string;
  path?: string;
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

    // For primary accounts, exclude shared folders created for backup accounts
    // For backup accounts, only show files from shared folder
    let query = 'https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)';
    
    if (account.account_type === 'backup' && account.shared_folder_id) {
      // For backup accounts, only show files from shared folder
      query += `&q='${account.shared_folder_id}' in parents`;
    } else if (account.account_type === 'primary') {
      // For primary accounts, exclude files that are in shared folders created for backups
      const { data: backupAccounts } = await supabase
        .from('google_accounts')
        .select('shared_folder_id')
        .eq('user_id', user.user.id)
        .eq('account_type', 'backup')
        .not('shared_folder_id', 'is', null);

      if (backupAccounts && backupAccounts.length > 0) {
        const excludeFolders = backupAccounts
          .map(acc => `'${acc.shared_folder_id}' in parents`)
          .join(' or ');
        query += `&q=not (${excludeFolders})`;
      }
      
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }
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
        thumbnailUrl: file.thumbnailLink,
        parentId: file.parents?.[0]
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

  async createFolder(name: string, accountId: string, parentFolderId?: string): Promise<string> {
    const accessToken = await this.authService.ensureValidToken(accountId);

    const { data: account } = await supabase
      .from('google_accounts')
      .select('account_type, shared_folder_id')
      .eq('google_account_id', accountId)
      .single();

    let targetParentId = parentFolderId;
    
    // For backup accounts, create folders in shared folder if no parent specified
    if (account?.account_type === 'backup' && account.shared_folder_id && !parentFolderId) {
      targetParentId = account.shared_folder_id;
    }

    const metadata: any = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder'
    };

    if (targetParentId) {
      metadata.parents = [targetParentId];
    }

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!response.ok) {
      throw new Error('Failed to create folder');
    }

    const folder = await response.json();
    return folder.id;
  }

  async deleteFile(fileId: string, accountId: string): Promise<void> {
    const accessToken = await this.authService.ensureValidToken(accountId);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
  }

  async deleteFolder(folderId: string, accountId: string): Promise<void> {
    const accessToken = await this.authService.ensureValidToken(accountId);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to delete folder');
    }
  }

  async moveFileWithPath(fileId: string, sourceAccountId: string, targetAccountId: string, targetFolderId: string, maintainPath: boolean = true): Promise<void> {
    const sourceAccessToken = await this.authService.ensureValidToken(sourceAccountId);
    const targetAccessToken = await this.authService.ensureValidToken(targetAccountId);

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

    // Create folder path in target if maintainPath is true
    let finalTargetFolderId = targetFolderId;
    if (maintainPath && fileMetadata.parents) {
      finalTargetFolderId = await this.recreateFolderPath(
        fileMetadata.parents[0], 
        sourceAccessToken, 
        targetAccessToken,
        targetFolderId,
        sourceAccountId,
        targetAccountId
      );
    }

    // Check for duplicate names in target folder
    await this.ensureUniqueFileName(fileMetadata.name, finalTargetFolderId, targetAccessToken);

    // Upload to target account
    const uploadMetadata: any = {
      name: fileMetadata.name,
      mimeType: fileMetadata.mimeType,
      parents: [finalTargetFolderId]
    };

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
    await this.deleteFile(fileId, sourceAccountId);
  }

  async getGooglePhotos(accountId: string): Promise<DriveFile[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const accessToken = await this.authService.ensureValidToken(accountId);

    // Query for image and video files
    const query = 'https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents,imageMediaMetadata,videoMediaMetadata)&q=mimeType contains "image/" or mimeType contains "video/"';

    try {
      const response = await fetch(query, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch photos from Google Drive');
      }

      const data = await response.json();
      
      const photos: DriveFile[] = data.files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0'),
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        accountId: accountId,
        downloadUrl: file.webViewLink,
        thumbnailUrl: file.thumbnailLink,
        parentId: file.parents?.[0],
        metadata: {
          ...file.imageMediaMetadata,
          ...file.videoMediaMetadata
        }
      }));

      return photos;
    } catch (error) {
      console.error('Error fetching photos:', error);
      return [];
    }
  }

  async movePhotoWithMetadata(photoId: string, sourceAccountId: string, targetAccountId: string, targetFolderId: string, maintainPath: boolean = true): Promise<void> {
    const sourceAccessToken = await this.authService.ensureValidToken(sourceAccountId);
    const targetAccessToken = await this.authService.ensureValidToken(targetAccountId);

    // Get photo metadata including EXIF data
    const photoResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${photoId}?fields=name,mimeType,parents,imageMediaMetadata,videoMediaMetadata`, {
      headers: { 'Authorization': `Bearer ${sourceAccessToken}` }
    });
    
    const photoMetadata = await photoResponse.json();

    // Download photo content
    const downloadResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${photoId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${sourceAccessToken}` }
    });
    
    const photoBlob = await downloadResponse.blob();

    // Create folder path in target if maintainPath is true
    let finalTargetFolderId = targetFolderId;
    if (maintainPath && photoMetadata.parents) {
      finalTargetFolderId = await this.recreateFolderPath(
        photoMetadata.parents[0], 
        sourceAccessToken, 
        targetAccessToken,
        targetFolderId,
        sourceAccountId,
        targetAccountId
      );
    }

    // Check for duplicate names in target folder
    await this.ensureUniqueFileName(photoMetadata.name, finalTargetFolderId, targetAccessToken);

    // Upload to target account with metadata preservation
    const uploadMetadata: any = {
      name: photoMetadata.name,
      mimeType: photoMetadata.mimeType,
      parents: [finalTargetFolderId]
    };

    // Preserve EXIF metadata if available
    if (photoMetadata.imageMediaMetadata) {
      uploadMetadata.imageMediaMetadata = photoMetadata.imageMediaMetadata;
    }
    if (photoMetadata.videoMediaMetadata) {
      uploadMetadata.videoMediaMetadata = photoMetadata.videoMediaMetadata;
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(uploadMetadata)], { type: 'application/json' }));
    form.append('file', photoBlob);

    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${targetAccessToken}` },
        body: form
      }
    );

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload photo to backup account');
    }

    // Share the moved photo back to primary account
    await this.shareFileToPrimary(photoId, targetAccountId, sourceAccountId);

    // Delete from source account
    await this.deleteFile(photoId, sourceAccountId);
  }

  private async shareFileToPrimary(fileId: string, backupAccountId: string, primaryAccountId: string): Promise<void> {
    const backupAccessToken = await this.authService.ensureValidToken(backupAccountId);
    
    // Get primary account email
    const { data: primaryAccount } = await supabase
      .from('google_accounts')
      .select('email')
      .eq('google_account_id', primaryAccountId)
      .single();

    if (!primaryAccount) return;

    // Share file with primary account
    const shareResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${backupAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'user',
        emailAddress: primaryAccount.email
      })
    });

    if (!shareResponse.ok) {
      console.error('Failed to share file with primary account');
    }
  }

  private async recreateFolderPath(
    sourceFolderId: string,
    sourceToken: string,
    targetToken: string,
    rootTargetFolder: string,
    sourceAccountId: string,
    targetAccountId: string
  ): Promise<string> {
    // Get folder path from source
    const folderPath = await this.getFolderPath(sourceFolderId, sourceToken);
    
    let currentTargetFolder = rootTargetFolder;
    
    // Create folder structure in target
    for (const folderName of folderPath) {
      const existingFolderId = await this.findFolderByName(folderName, currentTargetFolder, targetToken);
      
      if (existingFolderId) {
        currentTargetFolder = existingFolderId;
      } else {
        currentTargetFolder = await this.createFolderInParent(folderName, currentTargetFolder, targetToken);
      }
    }
    
    return currentTargetFolder;
  }

  private async getFolderPath(folderId: string, accessToken: string): Promise<string[]> {
    const path: string[] = [];
    let currentFolderId = folderId;
    
    while (currentFolderId) {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${currentFolderId}?fields=name,parents`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      const folderData = await response.json();
      path.unshift(folderData.name);
      
      currentFolderId = folderData.parents?.[0];
      
      // Stop if we reach root or a shared folder
      if (!currentFolderId || currentFolderId === 'root') break;
    }
    
    return path;
  }

  private async findFolderByName(name: string, parentId: string, accessToken: string): Promise<string | null> {
    const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder'`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const data = await response.json();
    return data.files.length > 0 ? data.files[0].id : null;
  }

  private async createFolderInParent(name: string, parentId: string, accessToken: string): Promise<string> {
    const metadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };

    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    const folder = await response.json();
    return folder.id;
  }

  private async ensureUniqueFileName(fileName: string, parentFolderId: string, accessToken: string): Promise<string> {
    const query = `name='${fileName}' and '${parentFolderId}' in parents`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const data = await response.json();
    
    if (data.files.length > 0) {
      throw new Error(`A file with the name "${fileName}" already exists in the target folder`);
    }
    
    return fileName;
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

    const { data: targetAccount } = await supabase
      .from('google_accounts')
      .select('shared_folder_id')
      .eq('google_account_id', targetAccountId)
      .single();

    if (!targetAccount?.shared_folder_id) throw new Error('Target account shared folder not found');

    await this.moveFileWithPath(fileId, sourceAccountId, targetAccountId, targetAccount.shared_folder_id, maintainPath);
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
