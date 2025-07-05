
export interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  accessToken: string;
  refreshToken: string;
  totalStorage: number; // in bytes
  usedStorage: number; // in bytes
  connectedAt: Date;
}

export interface AuthState {
  isAuthenticated: boolean;
  accounts: GoogleAccount[];
  currentAccount?: GoogleAccount;
}

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
