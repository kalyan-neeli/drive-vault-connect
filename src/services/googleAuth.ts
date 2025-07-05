
import { supabase } from '@/integrations/supabase/client';

const GOOGLE_CLIENT_ID = 'afasj,gnsdkjgbndts.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  accessToken: string;
  refreshToken: string;
  totalStorage: number;
  usedStorage: number;
  connectedAt: Date;
}

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

export class GoogleAuthService {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Google Auth can only be used in browser'));
        return;
      }

      // Load Google API script
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: this.handleCredentialResponse.bind(this),
        });

        // Load GAPI for Drive API
        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = () => {
          window.gapi.load('client:auth2', () => {
            window.gapi.client.init({
              apiKey: '', // We'll use OAuth token instead
              clientId: GOOGLE_CLIENT_ID,
              discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
              scope: SCOPES
            }).then(() => {
              this.isInitialized = true;
              resolve();
            });
          });
        };
        document.head.appendChild(gapiScript);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  private async handleCredentialResponse(response: any) {
    try {
      const credential = response.credential;
      // This is for the One Tap flow - we'll handle OAuth flow separately
      console.log('Credential response:', credential);
    } catch (error) {
      console.error('Error handling credential response:', error);
    }
  }

  async connectAccount(): Promise<GoogleAccount> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const authInstance = window.gapi.auth2.getAuthInstance();
      
      authInstance.signIn({
        scope: SCOPES
      }).then(async (googleUser: any) => {
        try {
          const profile = googleUser.getBasicProfile();
          const authResponse = googleUser.getAuthResponse();
          
          // Get storage info from Drive API
          const storageInfo = await this.getStorageInfo(authResponse.access_token);
          
          const account: GoogleAccount = {
            id: profile.getId(),
            email: profile.getEmail(),
            name: profile.getName(),
            avatar: profile.getImageUrl(),
            accessToken: authResponse.access_token,
            refreshToken: authResponse.refresh_token || '',
            totalStorage: storageInfo.limit,
            usedStorage: storageInfo.usage,
            connectedAt: new Date()
          };

          // Store in Supabase
          await this.storeAccountInDatabase(account);
          
          resolve(account);
        } catch (error) {
          reject(error);
        }
      }).catch(reject);
    });
  }

  private async getStorageInfo(accessToken: string) {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      const data = await response.json();
      const quota = data.storageQuota;
      
      return {
        limit: parseInt(quota.limit || '0'),
        usage: parseInt(quota.usage || '0')
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { limit: 0, usage: 0 };
    }
  }

  private async storeAccountInDatabase(account: GoogleAccount) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('google_accounts')
      .upsert({
        user_id: user.user.id,
        google_account_id: account.id,
        email: account.email,
        name: account.name,
        avatar_url: account.avatar,
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
        token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
        total_storage: account.totalStorage,
        used_storage: account.usedStorage,
        connected_at: account.connectedAt.toISOString()
      });

    if (error) throw error;
  }

  async getConnectedAccounts(): Promise<GoogleAccount[]> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return [];

    const { data, error } = await supabase
      .from('google_accounts')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('status', 'active');

    if (error) throw error;

    return data.map(account => ({
      id: account.google_account_id,
      email: account.email,
      name: account.name,
      avatar: account.avatar_url,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      totalStorage: account.total_storage || 0,
      usedStorage: account.used_storage || 0,
      connectedAt: new Date(account.connected_at)
    }));
  }

  async removeAccount(accountId: string): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('google_accounts')
      .delete()
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId);

    if (error) throw error;
  }
}
