'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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
  setIsAuthenticated: (v: boolean) => void; // أضف هذا
  setAuthUser: (user: User | null) => void; // وأضف هذا
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
    isLoading: true,
    user: null,
    error: null
  });

  const checkSession = useCallback(async (): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    console.log('[AuthContext checkSession] Starting session check.');
    try {
      const response = await fetch('/api/auth/session', { 
        method: 'GET', 
        credentials: 'include' });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user && data.user.wallet) {
          setAuthState({ 
            isAuthenticated: true, 
            isLoading: false,
            user: { publicKey: data.user.wallet, wallet: data.user.wallet },
            error: null
          });
          return true;
        }
      }
      setAuthState(prev => ({ ...prev, 
        isAuthenticated: false, 
        isLoading: false, 
        user: null 
      }));
      return false;
    } catch (error) {
      console.error('[AuthContext checkSession] Session check request failed:', error);
      setAuthState(prev => ({ 
        ...prev, 
        isAuthenticated: false, 
        isLoading: false, 
        user: null, 
        error: 'Session check failed.' 
      }));
      return false;
    }
  }, []);

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
      if (authState.error !== finalErrMsg) { // Avoid redundant state updates if error is already set by a specific throw
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

  useEffect(() => {
    if (!connected) {
        if (authState.isAuthenticated) {
             console.log("[AuthContext] Wallet disconnected externally. Resetting auth state.");
             setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: null });
        } else if (authState.isLoading) { 
             setAuthState(prev => ({ ...prev, isLoading: false }));
        }
    }
    if(authState.isLoading && !connected && !authState.isAuthenticated){
        setAuthState(prev => ({ ...prev, isLoading: false}));
    }
  }, [connected, authState.isAuthenticated, authState.isLoading]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    setIsAuthenticated: (v: boolean) => setAuthState(prev => ({ ...prev, isAuthenticated: v })),
    setAuthUser: (user: User | null) => setAuthState(prev => ({ ...prev, user })),
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
