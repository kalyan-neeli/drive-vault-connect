
// Re-export from services for backward compatibility
export type { GoogleAccount } from '@/services/googleAuth';

export interface AuthState {
  isAuthenticated: boolean;
  accounts: GoogleAccount[];
  currentAccount?: GoogleAccount;
}

// Re-export from services for backward compatibility
export type { DriveFile } from '@/services/driveService';
