export interface User {
  publicKey: string;
  wallet: string;
  authMethod?: string | undefined;
  totpEnabled?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
  isLocked: boolean;
  authMethod?: string | undefined;
}

export interface LoginResponse {
  success?: boolean;
  publicKey?: string;
  authMethod?: string;
  totpEnabled?: boolean;
  error?: string;
  nonce?: string;
}

export interface WebAuthnRegisterOptions {
  challenge: string;
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  [key: string]: unknown;
}

export interface AuthContextType extends AuthState {
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  isWalletConnectedAndMatching: boolean;
  logoutAndRedirect: (redirectPath?: string) => Promise<void>;
  retrySessionCheck: () => void;
  triggerSessionRefresh: () => Promise<boolean>;
  /** Directly update auth state after TOTP enable — avoids cache race condition */
  markTOTPEnabled: () => void;
  registerPasskey: (description?: string) => Promise<boolean>;
  loginWithPasskey: (preSelectedCredential?: unknown) => Promise<boolean>;
  verifyTOTP: (token: string) => Promise<boolean>;
  hasPasskey: boolean;
  totpEnabled: boolean;
  securityLevel: "Standard" | "Enhanced" | "Maximum";
  isOnline: boolean;
  performanceStats: { averageLoadTime?: string; cacheHitRate?: string };
}
