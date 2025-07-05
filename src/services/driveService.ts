
import { supabase } from '@/integrations/supabase/client';

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
  async getFiles(accountId: string): Promise<DriveFile[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // First get the account details to get the access token
    const { data: account, error: accountError } = await supabase
      .from('google_accounts')
      .select('access_token')
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId)
      .single();

    if (accountError) throw accountError;

    // Fetch files from Google Drive API
    try {
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?fields=files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink)',
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`
          }
        }
      );

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

  async uploadFile(file: File, accountId: string): Promise<DriveFile> {
    const { data: account, error } = await supabase
      .from('google_accounts')
      .select('access_token')
      .eq('google_account_id', accountId)
      .single();

    if (error) throw error;

    const metadata = {
      name: file.name,
      mimeType: file.type
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,createdTime,modifiedTime',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.access_token}`
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
}
