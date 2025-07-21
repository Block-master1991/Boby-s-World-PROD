'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletSignMessageError } from '@solana/wallet-adapter-base';
import { useToast } from '@/hooks/use-toast';


// --- Types for AuthState and AuthContext ---
export interface User {
  publicKey: string; // Wallet public key as string
  wallet: string;    // Typically same as publicKey, or a specific identifier if different
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  login: () => Promise<boolean>; // Returns true on success, throws error on failure
  logout: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  isWalletConnectedAndMatching: boolean; // Indicates if the connected wallet matches the authenticated user
  logoutAndRedirect: (redirectPath?: string) => Promise<void>; // New: Force logout and redirect
  retrySessionCheck: () => void;

}

// --- Create Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- AuthProvider Component ---
interface AuthProviderProps {
  children: ReactNode;
}

function buildSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Boby's World.\nNonce: ${nonce}`;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { publicKey: adapterPublicKey, signMessage: walletSignMessage, connected, disconnect: adapterDisconnect } = useWallet();
  const { toast } = useToast();

  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true, // Start as loading to check session
    user: null,
    error: null
  });
  const [retryRequested, setRetryRequested] = useState(false);

  // Derived state: Is the wallet connected AND does its public key match the authenticated user's public key?
  const isWalletConnectedAndMatching = useMemo(() => {
    // Ensure 'connected' is treated as a boolean, as useWallet's 'connected' can sometimes be null/undefined during initial render
    return !!connected && !!adapterPublicKey && authState.user?.publicKey === adapterPublicKey.toBase58();
  }, [connected, adapterPublicKey, authState.user?.publicKey]);

  const checkSession = useCallback(async (): Promise<boolean> => {
    // Only set loading if not already authenticated, to avoid flickering if session is valid
    if (!authState.isAuthenticated) {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    }
    console.log('[AuthContext checkSession] Starting session check.');
    try {
      const response = await fetch('/api/auth/session', { 
        method: 'GET', 
        credentials: 'include' 
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user && data.user.wallet) {
          setAuthState(prev => ({ 
            ...prev, // Keep existing loading state if it was true
            isAuthenticated: true, 
            user: { publicKey: data.user.wallet, wallet: data.user.wallet },
            error: null
          }));
          console.log('[AuthContext checkSession] Session check successful. Authenticated.');
          return true;
        }
      } else if (response.status === 401 || response.status === 403) {
          // If the user was previously authenticated, and now the session is invalid, force logout.
          // If they were not authenticated, it's just a normal unauthenticated state, no need to force logout/redirect.
          if (authState.isAuthenticated) {
            console.warn('[AuthContext checkSession] Session expired or unauthorized for an authenticated user. Forcing logout and redirect.');
            console.log('[AuthContext checkSession] Triggering logoutAndRedirect from checkSession due to 401/403.');
            await logoutAndRedirect('/');
            toast({ variant: 'destructive', title: 'Session Expired', description: 'You have been logged out due to session timeout or wallet mismatch.' });
          } else {
            console.log('[AuthContext checkSession] Not authenticated, which is expected for new/logged out users.');
            setAuthState(prev => ({ 
              ...prev, 
              isAuthenticated: false, 
              user: null, 
              error: null 
            }));
          }
          return false;
        }
      // If response not OK and not 401/403, clear auth state (e.g., 500 error, or other non-auth related issues)
      console.log('[AuthContext checkSession] Session check failed or not authenticated (non-401/403 response).');
      setAuthState(prev => ({ 
        ...prev, 
        isAuthenticated: false, 
        user: null, 
        error: null // Clear error on successful check that just shows not authenticated
      }));
      return false;
    } catch (error) {
      console.error('[AuthContext checkSession] Session check request failed:', error);
      setAuthState(prev => ({ 
        ...prev, 
        isAuthenticated: false, 
        user: null, 
        error: 'Session check failed due to network or server error.' 
      }));
      toast({ variant: 'destructive', title: 'Network Error', description: 'Failed to validate session. Please check your connection.' });
      return false;
    } finally {
      setAuthState(prev => ({ ...prev, isLoading: false })); // Always set loading to false at the end
      setRetryRequested(false);

    }
  }, [authState.isAuthenticated]); // Depend on isAuthenticated to avoid unnecessary loading state changes

  const retrySessionCheck = useCallback(() => {
    setRetryRequested(true);
  }, []);

  useEffect(() => {
    if (retryRequested) {
      checkSession();
    }
  }, [retryRequested, checkSession]);

  const login = useCallback(async (): Promise<boolean> => {
    if (!adapterPublicKey || !walletSignMessage || !connected) {
      const errMsg = 'Wallet not connected or signMessage not available for login.';
      setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
      toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
      throw new Error(errMsg);
    }
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    console.log('[AuthContext login] Starting login for PK:', adapterPublicKey.toString());

    try {
      console.log('[AuthContext login] Step 1: Fetching nonce...');
      const nonceResponse = await fetch(`/api/auth/login?publicKey=${adapterPublicKey.toString()}`);
      if (!nonceResponse.ok) {
        const errorData = await nonceResponse.json().catch(() => ({ error: 'Nonce fetch failed or non-JSON response' }));
        const errMsg = errorData.error || `Failed to get nonce (status ${nonceResponse.status})`;
        setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
        toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
        throw new Error(errMsg);
      }
      const { nonce } = await nonceResponse.json();
      console.log('[AuthContext login] Nonce received:', nonce);

      console.log('[AuthContext login] Step 2: Requesting signature from wallet...');
      
      
      let signatureHex;
      try {
        const message = buildSignMessage(nonce);
        const messageBytes = new TextEncoder().encode(message);
        const signature = await walletSignMessage(messageBytes);
        signatureHex = Buffer.from(signature).toString('hex');
        console.log('[AuthContext login] Signature received (hex):', signatureHex ? `${signatureHex.substring(0,10)}...` : 'Empty');
      } catch (signError: any) {
        let userFacingError = 'Failed to sign message.';

        if (signError?.message?.includes('User rejected')) {
          userFacingError = 'User rejected the signature request.';
        } else if (signError?.name === 'WalletSignMessageError') {
          userFacingError = `Wallet signing error: ${(signError as WalletSignMessageError).message || 'User rejected or unknown error.'}`;
        } else if (signError?.message) {
          userFacingError = `Signing error: ${signError.message}`;
        }
        
        toast({
          variant: 'destructive',
          title: 'Signature Failed',
          description: userFacingError,
        });

        setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: userFacingError });
        throw new Error(userFacingError);

      }

      console.log('[AuthContext login] Step 3: Sending signature and nonce to /api/auth/login (POST)...');
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          publicKey: adapterPublicKey.toString(), 
          signature: signatureHex, 
          nonce
         })
      });

      const loginData = await loginResponse.json().catch(() => ({ error: 'Login failed.' }));
      if (!loginResponse.ok) {
        const errMsg = loginData.error;
        if (loginResponse.status === 403) {
          await logoutAndRedirect('/');
          toast({ variant: 'destructive', title: 'Access Denied', description: errMsg });
          return false;
        }
        toast({ variant: 'destructive', title: 'Login Failed', description: errMsg });
        setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
        throw new Error(errMsg);

      }

      if (loginData.success && loginData.publicKey) {
        setAuthState({ isAuthenticated: true, isLoading: false, user: { publicKey: loginData.publicKey, wallet: loginData.publicKey }, error: null });
        toast({ variant: 'default', title: 'Login Successful', description: `Welcome back! Wallet ${loginData.publicKey.slice(0, 8)}...` });
        return true;

      }

      const fallbackError = loginData.error || 'Login failed.';
      setAuthState(prev => ({ ...prev, isLoading: false, error: fallbackError }));
      toast({ variant: 'destructive', title: 'Login Failed', description: fallbackError });
      throw new Error(fallbackError);
    } catch (error: any) {
      const errMsg = error.message || 'Unknown login error';
      setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, user: null, error: errMsg }));
      toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
      throw error;
    }
  }, [adapterPublicKey, walletSignMessage, connected, authState.error]);
  
  const logout = useCallback(async (): Promise<void> => {
    const currentPK = authState.user?.publicKey;
    console.log(`[AuthContext logout] Logging out user: ${currentPK || 'N/A'}`);
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      console.log('[FRONTEND] Starting logout process');

      // Get CSRF token from cookies
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrfToken='))?.split('=')[1];

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
        console.log('[FRONTEND] CSRF token found and added to headers.');
      } else {
        console.warn('[FRONTEND] CSRF token not found in cookies for logout request.');
      }

      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify({ publicKey: currentPK })
      });
      toast({ variant: 'default', title: 'Logged Out', description: 'You have been logged out successfully.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'Failed to contact server during logout.' });
    } finally {
      setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: null });
    }
  }, [authState.user?.publicKey]);

  const logoutAndRedirect = useCallback(async (redirectPath: string = '/') => {
    console.log(`[AuthContext logoutAndRedirect] Forcing logout and redirecting to ${redirectPath}`);
    await logout(); // Perform the regular logout process (clears server-side session)
    if (connected) {
      try {
        await adapterDisconnect(); // Disconnect the wallet adapter
        console.log("[AuthContext logoutAndRedirect] Wallet adapter disconnected.");
      } catch (error) {
        console.error("[AuthContext logoutAndRedirect] Error disconnecting wallet adapter:", error);
      }
    }
    // Use window.location.href for a full page reload to ensure all state is reset
    // This is more robust for security-critical redirects than Next.js router.push
    window.location.href = redirectPath;
  }, [logout, connected, adapterDisconnect]);

  // Initial session check on mount and periodic refresh
  useEffect(() => {
    let sessionCheckInterval: NodeJS.Timeout | null = null; // Initialize with null

    const startSessionCheckInterval = () => {
      // Clear any existing interval first
      if (sessionCheckInterval) { // Check if it's not null before clearing
        clearInterval(sessionCheckInterval);
      }
      // Check session every 12 minutes (720,000 ms)
      // This should be less than ACCESS_TOKEN_EXPIRY_SECONDS (15 minutes)
      sessionCheckInterval = setInterval(() => {
        console.log('[AuthContext] Periodically checking session...');
        checkSession();
      }, 12 * 60 * 1000); // 12 minutes
    };

    // Perform initial check
    checkSession().then(isAuthenticated => {
      if (isAuthenticated) {
        startSessionCheckInterval();
      }
    });

    // Restart interval if authentication state changes to authenticated
    if (authState.isAuthenticated) {
      startSessionCheckInterval();
    } else {
      // If not authenticated, clear the interval
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
    }

    // Cleanup on unmount
    return () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
    };
  }, [checkSession, authState.isAuthenticated]); // Depend on checkSession and isAuthenticated

  // Effect to handle wallet connection changes and enforce mismatch logout
  useEffect(() => {
    
    if (!connected && !authState.isAuthenticated && authState.isLoading) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }

    // NEW LOGIC: Force logout if authenticated but wallet is mismatched
    if (authState.isAuthenticated && authState.user && !isWalletConnectedAndMatching) {
      console.warn("[AuthContext] Authenticated session detected with a mismatched or disconnected wallet. Forcing logout.");
      console.log(`[AuthContext useEffect] isWalletConnectedAndMatching: ${isWalletConnectedAndMatching}. Triggering logoutAndRedirect from useEffect.`);
      logoutAndRedirect('/'); // Redirect to home without a flag
      toast({ variant: 'destructive', title: 'Wallet Mismatch', description: 'Your connected wallet does not match the session.' });

    }
  }, [connected, authState.isAuthenticated, authState.isLoading, authState.user, isWalletConnectedAndMatching, logoutAndRedirect]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    isWalletConnectedAndMatching, // Include the new derived state
    logoutAndRedirect, // Include the new function
    retrySessionCheck
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
