import { supabase } from '@/integrations/supabase/client';

const GOOGLE_CLIENT_ID = 'afasj,gnsdkjgbndts.apps.googleusercontent.com';
// Note: For refresh tokens to work in production, you'll need to add the client secret to Supabase Edge Functions
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile', 
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
];

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
  accountType: 'primary' | 'backup';
  sharedFolderId?: string;
}

export class GoogleAuthService {
  private codeVerifier = '';
  private codeChallenge = '';

  private getRedirectUri(): string {
    return `${window.location.origin}/auth/callback`;
  }

  // Generate PKCE code verifier and challenge
  private async generatePKCE(): Promise<void> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    this.codeVerifier = btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const encoder = new TextEncoder();
    const data = encoder.encode(this.codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    this.codeChallenge = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async connectAccount(): Promise<GoogleAccount> {
    try {
      // Generate PKCE parameters
      await this.generatePKCE();

      // Build authorization URL
      const redirectUri = this.getRedirectUri();
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', SCOPES.join(' '));
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('code_challenge', this.codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', crypto.randomUUID());

      // Open popup window for authorization
      const popup = window.open(
        authUrl.toString(),
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            reject(new Error('Authorization cancelled'));
          }
        }, 1000);

        // Listen for authorization code from popup
        const messageListener = async (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup?.close();

            try {
              const authCode = event.data.code;
              const account = await this.exchangeCodeForTokens(authCode);
              resolve(account);
            } catch (error) {
              reject(error);
            }
          } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            popup?.close();
            reject(new Error(event.data.error));
          }
        };

        window.addEventListener('message', messageListener);
      });
    } catch (error) {
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  private async exchangeCodeForTokens(authCode: string): Promise<GoogleAccount> {
    try {
      // Exchange authorization code for tokens
      const redirectUri = this.getRedirectUri();
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          code: authCode,
          code_verifier: this.codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await tokenResponse.json();
      
      // Get user profile information
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error('Failed to get user profile');
      }

      const profile = await profileResponse.json();

      // Get storage info from Drive API
      const storageInfo = await this.getStorageInfo(tokens.access_token);

      // Check if this is the first account (will be primary)
      const existingAccounts = await this.getConnectedAccounts();
      const accountType = existingAccounts.length === 0 ? 'primary' : 'backup';

      const account: GoogleAccount = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatar: profile.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        totalStorage: storageInfo.limit,
        usedStorage: storageInfo.usage,
        connectedAt: new Date(),
        accountType
      };

      // Store in Supabase
      await this.storeAccountInDatabase(account, tokens.expires_in);

      // If this is a backup account, create shared folder and set permissions
      if (accountType === 'backup') {
        const primaryAccount = existingAccounts.find(acc => acc.accountType === 'primary');
        if (primaryAccount) {
          const sharedFolderId = await this.createSharedFolder(account, primaryAccount);
          account.sharedFolderId = sharedFolderId;
          await this.updateSharedFolderId(account.id, sharedFolderId);
        }
      }

      return account;
    } catch (error) {
      throw new Error(`Token exchange failed: ${error}`);
    }
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

  private async storeAccountInDatabase(account: GoogleAccount, expiresIn: number = 3600) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

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
        token_expires_at: expiresAt.toISOString(),
        total_storage: account.totalStorage,
        used_storage: account.usedStorage,
        connected_at: account.connectedAt.toISOString(),
        account_type: account.accountType,
        shared_folder_id: account.sharedFolderId
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

    const accounts = data.map(account => ({
      id: account.google_account_id,
      email: account.email,
      name: account.name,
      avatar: account.avatar_url,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      totalStorage: account.total_storage || 0,
      usedStorage: account.used_storage || 0,
      connectedAt: new Date(account.connected_at),
      accountType: account.account_type as 'primary' | 'backup',
      sharedFolderId: account.shared_folder_id
    }));

    // Validate and refresh tokens for all accounts
    for (const account of accounts) {
      try {
        const validToken = await this.ensureValidToken(account.id);
        account.accessToken = validToken;
      } catch (error) {
        console.error(`Failed to refresh token for account ${account.email}:`, error);
      }
    }

    return accounts;
  }

  private async refreshAccessToken(refreshToken: string, accountId: string): Promise<{ accessToken: string; expiresAt: Date }> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User not authenticated');
    }

    const response = await fetch('https://zxxcowhyrhlgkfhtsxre.supabase.co/functions/v1/refresh-google-token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
        accountId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to refresh access token');
    }

    const data = await response.json();
    
    return {
      accessToken: data.accessToken,
      expiresAt: new Date(data.expiresAt)
    };
  }

  private async updateTokenInDatabase(accountId: string, accessToken: string, expiresAt: Date): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('google_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: expiresAt.toISOString()
      })
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId);

    if (error) throw error;
  }

  private isTokenExpired(expiresAt: string): boolean {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiry <= fiveMinutesFromNow;
  }

  async ensureValidToken(accountId: string): Promise<string> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: account, error } = await supabase
      .from('google_accounts')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId)
      .single();

    if (error || !account) throw new Error('Account not found');

    // Check if token is expired or about to expire
    if (this.isTokenExpired(account.token_expires_at)) {
      try {
        console.log(`Token expired for account ${accountId}, refreshing...`);
        const { accessToken, expiresAt } = await this.refreshAccessToken(account.refresh_token, accountId);
        await this.updateTokenInDatabase(accountId, accessToken, expiresAt);
        console.log(`Token refreshed successfully for account ${accountId}`);
        return accessToken;
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // Mark account as expired
        await supabase
          .from('google_accounts')
          .update({ status: 'expired' })
          .eq('user_id', user.user.id)
          .eq('google_account_id', accountId);
        throw new Error('Token refresh failed. Please reconnect your account.');
      }
    }

    return account.access_token;
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

  private async createSharedFolder(backupAccount: GoogleAccount, primaryAccount: GoogleAccount): Promise<string> {
    const folderName = `shared_${primaryAccount.email}`;
    
    const existingFolderId = await this.findExistingSharedFolder(backupAccount.accessToken, folderName, primaryAccount.email);
    if (existingFolderId) {
      return existingFolderId;
    }

    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };

    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${backupAccount.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(folderMetadata)
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create shared folder');
    }

    const folder = await createResponse.json();
    
    const permission = {
      role: 'writer',
      type: 'user',
      emailAddress: primaryAccount.email
    };

    const shareResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${folder.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${backupAccount.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(permission)
    });

    if (!shareResponse.ok) {
      throw new Error('Failed to share folder with primary account');
    }

    return folder.id;
  }

  private async findExistingSharedFolder(accessToken: string, folderName: string, primaryEmail: string): Promise<string | null> {
    try {
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder'&fields=files(id,name)`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        for (const folder of searchData.files) {
          const permissionsResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${folder.id}/permissions`,
            {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            }
          );

          const permissionsData = await permissionsResponse.json();
          const hasWriterPermission = permissionsData.permissions?.some(
            (perm: any) => perm.emailAddress === primaryEmail && perm.role === 'writer'
          );

          if (hasWriterPermission) {
            return folder.id;
          }
        }
      }
    } catch (error) {
      console.error('Error checking for existing shared folder:', error);
    }

    return null;
  }

  private async updateSharedFolderId(accountId: string, sharedFolderId: string): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('google_accounts')
      .update({ shared_folder_id: sharedFolderId })
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId);

    if (error) throw error;
  }

  async setPrimaryAccount(accountId: string): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    await supabase
      .from('google_accounts')
      .update({ account_type: 'backup' })
      .eq('user_id', user.user.id);

    const { error } = await supabase
      .from('google_accounts')
      .update({ account_type: 'primary' })
      .eq('user_id', user.user.id)
      .eq('google_account_id', accountId);

    if (error) throw error;
  }
}
