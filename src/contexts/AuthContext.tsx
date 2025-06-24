'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletSignMessageError } from '@solana/wallet-adapter-base';
import type { PublicKey as SolanaPublicKey } from '@solana/web3.js';

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
  isWalletConnectedAndMatching: boolean; // New: Indicates if the connected wallet matches the authenticated user
}

// --- Create Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- AuthProvider Component ---
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { publicKey: adapterPublicKey, signMessage: walletSignMessage, connected, disconnect: adapterDisconnect } = useWallet();
  
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true, // Start as loading to check session
    user: null,
    error: null
  });

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
      }
      // If response not OK or not authenticated, clear auth state
      console.log('[AuthContext checkSession] Session check failed or not authenticated.');
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
      return false;
    } finally {
      setAuthState(prev => ({ ...prev, isLoading: false })); // Always set loading to false at the end
    }
  }, [authState.isAuthenticated]); // Depend on isAuthenticated to avoid unnecessary loading state changes

  const login = useCallback(async (): Promise<boolean> => {
    if (!adapterPublicKey || !walletSignMessage || !connected) {
      const errMsg = 'Wallet not connected or signMessage not available for login.';
      setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
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
        throw new Error(errMsg);
      }
      const { nonce } = await nonceResponse.json();
      console.log('[AuthContext login] Nonce received:', nonce);

      console.log('[AuthContext login] Step 2: Requesting signature from wallet...');
      const message = `Sign this message to authenticate with Boby's World.\nNonce: ${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      
      let signatureHex;
      try {
        const signature = await walletSignMessage(messageBytes);
        signatureHex = Buffer.from(signature).toString('hex');
        console.log('[AuthContext login] Signature received (hex):', signatureHex ? `${signatureHex.substring(0,10)}...` : 'Empty');
      } catch (signError: any) {
        let userFacingError = 'Failed to sign message.';
        if (signError?.name === 'WalletSignMessageError') {
            userFacingError = `Wallet signing error: ${(signError as WalletSignMessageError).message || 'User rejected or unknown error.'}`;
        } else if (signError?.message) {
            userFacingError = `Signing error: ${signError.message}`;
        }
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

      if (!loginResponse.ok) {
        const errorDataLogin = await loginResponse.json().catch(() => ({error: 'Login verification failed or non-JSON response'}));
        const errMsgLogin = errorDataLogin.error || `Login verification failed (status ${loginResponse.status})`;
        setAuthState(prev => ({ ...prev, isLoading: false, error: errMsgLogin }));
        throw new Error(errMsgLogin);
      }
      
      const loginData = await loginResponse.json();

      if (loginData.success && loginData.publicKey) {
        console.log('[AuthContext login] Login successful. User PK:', loginData.publicKey);
        setAuthState({ 
          isAuthenticated: true, 
          isLoading: false, 
          user: { publicKey: loginData.publicKey, wallet: loginData.publicKey }, 
          error: null 
        });
        return true;
      } else {
        const serverErrorMsg = loginData.error || 'Login failed: Server indicated failure but provided no specific error message.';
        setAuthState(prev => ({...prev, isLoading: false, error: serverErrorMsg}));
        throw new Error(serverErrorMsg);
      }
    } catch (error: any) {
      // This catch block handles errors thrown explicitly above, or unexpected errors.
      // Ensure error state is set before re-throwing.
      const finalErrMsg = error.message || 'An unknown error occurred during the login process.';
      // Only update error state if it's different to avoid unnecessary re-renders
      if (authState.error !== finalErrMsg) { 
          setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, user: null, error: finalErrMsg }));
      }
      console.error('[AuthContext login] Login process failed:', finalErrMsg, 'Stack:', error.stack);
      throw error; // Re-throw the error so the caller (GameContainer) can catch it
    }
  }, [adapterPublicKey, walletSignMessage, connected, authState.error]); // authState.error added to deps to avoid stale closure issues if retrying

  const logout = useCallback(async (): Promise<void> => {
    const currentPK = authState.user?.publicKey;
    console.log(`[AuthContext logout] Logging out user: ${currentPK || 'N/A'}`);
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      console.log('[FRONTEND] Starting logout process');
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: currentPK })
      });
      console.log('[FRONTEND] Logout successful');
    } catch (error) {
      console.error('[AuthContext logout] /api/auth/logout request failed:', error);
    } finally {
      setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: null });
    }
  }, [authState.user?.publicKey]);

  // Initial session check on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Effect to handle wallet connection changes
  useEffect(() => {
    // If wallet disconnects, but we are authenticated, we don't clear isAuthenticated.
    // We rely on checkSession to validate JWTs.
    // If wallet connects and we are not authenticated, we might trigger login attempt in AuthenticationScreen.
    // If wallet disconnects and we are NOT authenticated, ensure isLoading is false.
    if (!connected && !authState.isAuthenticated && authState.isLoading) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, [connected, authState.isAuthenticated, authState.isLoading]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    isWalletConnectedAndMatching, // Include the new derived state
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
