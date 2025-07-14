
import type { GoogleAccount } from '@/services/googleAuth';
import type { DriveFile } from '@/services/driveService';

// Re-export from services for backward compatibility
export type { GoogleAccount, DriveFile };

export interface AuthState {
  isAuthenticated: boolean;
  accounts: GoogleAccount[];
  currentAccount?: GoogleAccount;
}
