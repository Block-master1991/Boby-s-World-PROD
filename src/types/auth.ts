export interface User {
    publicKey: string;
    wallet: string;
}

export interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: User | null;
    error: string | null;
}

export interface LoginResponse {
    success?: boolean;
    publicKey?: string;
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
    registerPasskey: (description?: string) => Promise<boolean>;
    loginWithPasskey: (preSelectedCredential?: unknown) => Promise<boolean>;
    hasPasskey: boolean;
    securityLevel: 'Standard' | 'Enhanced' | 'Maximum';
    isOnline: boolean;
    performanceStats: { averageLoadTime?: string; cacheHitRate?: string; };
}
