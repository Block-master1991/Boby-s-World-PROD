'use client';

import { uint8ArrayToBase64url, safeBufferFromBase64url } from '@/utils/base64';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { WalletSignMessageError } from '@solana/wallet-adapter-base';
import { useToast } from '@/hooks/use-toast';
import { initializeOfflineCapabilities, initializeBackgroundProcessing } from '@/lib/offline-manager';
import { cacheManager, backgroundSync, performanceMonitor } from '@/lib/advanced-service-worker';
import { fetchWithCsrf } from '@/lib/utils';
import WebAuthnTransactionManager from '@/utils/webauthn-transaction';
import { logger } from '@/utils/logger';


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
  triggerSessionRefresh: () => Promise<boolean>;
  registerPasskey: (description?: string) => Promise<boolean>;
  loginWithPasskey: (preSelectedCredential?: any) => Promise<boolean>;
  hasPasskey: boolean;
  securityLevel: 'Standard' | 'Enhanced' | 'Maximum';
  isOnline: boolean;
  performanceStats: any;
}

// --- Create Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- AuthProvider Component ---
interface AuthProviderProps {
  children: ReactNode;
}

// Global singleton guard to ensure we only ever perform ONE initial session check per app load
if (typeof window !== 'undefined') {
  (window as any).__initialAuthCheckStarted = false;
}

function buildSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Boby World.\nNonce: ${nonce}`;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const { publicKey: adapterPublicKey, signMessage: walletSignMessage, connected, connecting, disconnect: adapterDisconnect, wallet } = useWallet();
  const { toast } = useToast();

  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true, // Start as loading to check session
    user: null,
    error: null
  });
  const [retryRequested, setRetryRequested] = useState(false);
  const [isGracePeriod, setIsGracePeriod] = useState(true); // Grace period for initial wallet connection
  const [hasPasskey, setHasPasskey] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Check if user has a passkey registered for this site
    const checkPasskey = async () => {
      if (typeof window !== 'undefined' && 'PublicKeyCredential' in window) {
        const saved = localStorage.getItem('boby_world_passkey_registered');
        if (saved === 'true') setHasPasskey(true);
      }
    };
    checkPasskey();
  }, []);

  // Derived state: Is the wallet connected AND does its public key match the authenticated user's public key?
  const isWalletConnectedAndMatching = useMemo(() => {
    // Ensure 'connected' is treated as a boolean, as useWallet's 'connected' can sometimes be null/undefined during initial render
    return !!connected && !!adapterPublicKey && authState.user?.publicKey === adapterPublicKey.toBase58();
  }, [connected, adapterPublicKey, authState.user?.publicKey]);

  // Grace period timer logic
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsGracePeriod(false);
      logger.log('[AuthContext] Initial grace period ended.');
    }, 15000); // 15 second grace period for autoConnect (increased for mobile)
    return () => clearTimeout(timer);
  }, []);

  // Use refs for values needed in callbacks to stabilize identities
  const userPublicKeyRef = useRef(authState.user?.publicKey);
  useEffect(() => {
    userPublicKeyRef.current = authState.user?.publicKey;
  }, [authState.user?.publicKey]);

  // Ref to prevent multiple concurrent login attempts
  const loginInProgressRef = useRef(false);
  // Ref to prevent multiple concurrent session checks
  const sessionCheckInProgressRef = useRef(false);

  const logout = useCallback(async (): Promise<void> => {
    const currentPK = userPublicKeyRef.current;
    logger.log(`[AuthContext logout] Logging out user: ${currentPK || 'N/A'}`);
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      logger.log('[FRONTEND] Starting logout process');

      // Get CSRF token from cookies
      const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrfToken='))?.split('=')[1];

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
        logger.log('[FRONTEND] CSRF token found and added to headers.');
      } else {
        logger.warn('[FRONTEND] CSRF token not found in cookies for logout request.');
      }

      // Professional Integration: Ensure logout is synchronized even if network is unstable
      const logoutOp = async () => {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: headers,
          credentials: 'include',
          body: JSON.stringify({ publicKey: currentPK })
        });
        logger.log('[AuthContext] BackgroundSync: Persistent logout completed.');
      };

      if (!navigator.onLine) {
        backgroundSync.addOperation(logoutOp, 10); // High priority
        toast({ title: 'Offline', description: 'Logout queued for sync when online.' });
      } else {
        await logoutOp();
      }

      toast({ variant: 'default', title: 'Logged Out', description: 'You have been logged out successfully.' });
    } catch (e) {
      performanceMonitor.recordError();
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'Failed to contact server during logout.' });
    } finally {
      // Clear all local session data regardless of server response
      localStorage.removeItem('offline_coin_queue_v1'); // Clear unsynced coins
      localStorage.removeItem('offline_penalty_queue_v1'); // Clear unsynced penalties
      localStorage.removeItem('last_user_pk'); // Clear last user wallet
      // Kept: passkey_onboarding_dismissed should persist across logouts to respect user preference
      sessionStorage.removeItem('captcha_verified_session'); // Clear captcha status

      // Also clear any other potential session storage to ensure clean state
      sessionStorage.clear();

      setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: null });
    }
  }, [toast]); // Stable logout identity

  const logoutAndRedirect = useCallback(async (redirectPath: string = '/') => {
    logger.log(`[AuthContext logoutAndRedirect] Forcing logout and redirecting to ${redirectPath}`);
    await logout(); // Perform the regular logout process (clears server-side session)
    if (connected) {
      try {
        await adapterDisconnect(); // Disconnect the wallet adapter
        logger.log("[AuthContext logoutAndRedirect] Wallet adapter disconnected.");
      } catch (error) {
        logger.error("[AuthContext logoutAndRedirect] Error disconnecting wallet adapter:", error);
      }
    }
    // Use window.location.href for a full page reload to ensure all state is reset
    // This is more robust for security-critical redirects than Next.js router.push
    window.location.href = redirectPath;
  }, [logout, connected, adapterDisconnect]);

  const isAuthenticatedRef = useRef(authState.isAuthenticated);
  useEffect(() => {
    isAuthenticatedRef.current = authState.isAuthenticated;
  }, [authState.isAuthenticated]);

  const checkSession = useCallback(async (): Promise<boolean> => {
    // Prevent multiple concurrent session checks (race condition protection)
    if (sessionCheckInProgressRef.current) {
      logger.warn('[AuthContext checkSession] Session check already in progress, skipping duplicate call');
      return isAuthenticatedRef.current; // Return current auth status
    }

    sessionCheckInProgressRef.current = true;

    try {
      // Only set loading if not already authenticated, to avoid flickering if session is valid
      if (!isAuthenticatedRef.current) {
        setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      }
      const startTime = Date.now();
      logger.log('[AuthContext checkSession] Starting session check.');
      try {
        // Professional Integration: Use cacheManager to handle the request with a strategy
        const request = new Request('/api/auth/session', {
          method: 'GET',
          credentials: 'include'
        });

        const response = await cacheManager.handleRequest(request) || await fetch(request);

        if (response && response.ok) {
          performanceMonitor.recordCacheHit();
          const data = await response.json();
          if (data.authenticated && data.user && data.user.wallet) {
            setAuthState(prev => ({
              ...prev,
              isAuthenticated: true,
              user: { publicKey: data.user.wallet, wallet: data.user.wallet },
              error: null
            }));
            localStorage.setItem('last_user_pk', data.user.wallet);
            logger.log('[AuthContext checkSession] Session check successful. Authenticated.');
            return true;
          }
        } else if (response.status === 401 || response.status === 403) {
          // If the user was previously authenticated, and now the session is invalid, force logout.
          if (isAuthenticatedRef.current) {
            logger.warn('[AuthContext checkSession] Session expired or unauthorized for an authenticated user. Forcing logout and redirect.');
            logger.log('[AuthContext checkSession] Triggering logoutAndRedirect from checkSession due to 401/403.');
            await logoutAndRedirect('/');
            toast({ variant: 'destructive', title: 'Session Expired', description: 'You have been logged out due to session timeout or wallet mismatch.' });
          } else {
            logger.log('[AuthContext checkSession] Not authenticated, which is expected for new/logged out users.');
            setAuthState(prev => ({
              ...prev,
              isAuthenticated: false,
              user: null,
              error: null
            }));
          }
          return false;
        }
        // If response not OK and not 401/403, clear auth state
        logger.log('[AuthContext checkSession] Session check failed or not authenticated (non-401/403 response).');
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          error: null
        }));
        return false;
      } catch (error) {
        performanceMonitor.recordError();
        logger.error('[AuthContext checkSession] Session check request failed:', error);
        setAuthState(prev => ({
          ...prev,
          isAuthenticated: false,
          user: null,
          error: 'Session check failed due to network or server error.'
        }));
        toast({ variant: 'destructive', title: 'Network Error', description: 'Failed to validate session. Please check your connection.' });
        return false;
      } finally {
        performanceMonitor.recordLoadTime(Date.now() - startTime);
        setAuthState(prev => ({ ...prev, isLoading: false }));
        setRetryRequested(false);
        sessionCheckInProgressRef.current = false;
      }
    } finally {
      sessionCheckInProgressRef.current = false;
    }
  }, [logoutAndRedirect, toast]);

  const retrySessionCheck = useCallback(() => {
    setRetryRequested(true);
  }, []);

  const triggerSessionRefresh = useCallback(async (): Promise<boolean> => {
    logger.log('[AuthContext triggerSessionRefresh] External request to refresh session.');
    return await checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (retryRequested) {
      checkSession();
    }
  }, [retryRequested, checkSession]);

  const login = useCallback(async (): Promise<boolean> => {
    // Prevent multiple concurrent login attempts (race condition protection)
    if (loginInProgressRef.current) {
      logger.warn('[AuthContext login] Login already in progress, ignoring duplicate call');
      return false; // Or throw error, but return false to be safe
    }

    loginInProgressRef.current = true;

    try {
      if (!adapterPublicKey || !walletSignMessage || !connected) {
        const errMsg = 'Wallet not connected or signMessage not available for login.';
        setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
        toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
        throw new Error(errMsg);
      }
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      logger.log('[AuthContext login] Starting login for PK:', adapterPublicKey.toString());
      const startTime = Date.now();

      try {
        logger.log('[AuthContext login] Step 1: Fetching nonce...');
        // Use a direct fetch here as apiFetch depends on AuthContext, avoiding circular dependency
        const nonceResponse = await fetch(`/api/auth/login?publicKey=${adapterPublicKey.toString()}`);
        if (!nonceResponse.ok) {
          const errorData = await nonceResponse.json().catch(() => ({ error: 'Nonce fetch failed or non-JSON response' }));
          const errMsg = errorData.error || `Failed to get nonce (status ${nonceResponse.status})`;
          setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
          toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
          throw new Error(errMsg);
        }
        const { nonce } = await nonceResponse.json();
        logger.log('[AuthContext login] Nonce received:', nonce);

        logger.log('[AuthContext login] Step 2: Requesting signature from wallet...');

        let signatureHex;
        try {
          const message = buildSignMessage(nonce);
          const messageBytes = new TextEncoder().encode(message);
          let signature;
          try {
            // Try to pass display options for all wallets that support it
            signature = await (wallet as any).signMessage(messageBytes, {
              display: JSON.stringify({
                title: 'Boby World',
                text: 'Sign in to Boby World',
                icon: `${window.location.origin}/Boby-logo.png`,
                domain: window.location.hostname
              })
            });
          } catch {
            // Fallback to standard signMessage if display options are not supported
            signature = await walletSignMessage(messageBytes);
          }
          signatureHex = Buffer.from(signature).toString('hex');
          logger.log('[AuthContext login] Signature received (hex):', signatureHex ? `${signatureHex.substring(0, 10)}...` : 'Empty');

        } catch (signError: unknown) {
          let userFacingError = 'Failed to sign message.';

          if (signError instanceof Error && signError?.message?.includes('User rejected')) {
            userFacingError = 'User rejected the signature request.';
          } else if (signError instanceof Error && signError?.name === 'WalletSignMessageError') {
            userFacingError = `Wallet signing error: ${(signError as WalletSignMessageError).message || 'User rejected or unknown error.'}`;
          } else if (signError instanceof Error && signError?.message) {
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

        logger.log('[AuthContext login] Step 3: Sending signature and nonce to /api/auth/login (POST)...');
        // Use a direct fetch here as apiFetch depends on AuthContext, avoiding circular dependency
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
          } else if (loginResponse.status === 400 && loginData.error === 'Invalid nonce. Please retry.' && loginData.nonce) {
            // Nonce mismatch: retry with the new nonce from the server
            logger.warn('[AuthContext login] Nonce mismatch detected. Retrying login with new nonce.');
            try {
              const message = buildSignMessage(loginData.nonce);
              const messageBytes = new TextEncoder().encode(message);
              let signature;
              try {
                signature = await (wallet as any).signMessage(messageBytes, {
                  display: JSON.stringify({
                    title: 'Boby World',
                    text: 'Sign in to Boby World',
                    icon: `${window.location.origin}/Boby-logo.png`,
                    domain: window.location.hostname
                  })
                });
              } catch {
                signature = await walletSignMessage(messageBytes);
              }
              const signatureHex = Buffer.from(signature).toString('hex');

              const retryLoginResponse = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  publicKey: adapterPublicKey.toString(),
                  signature: signatureHex,
                  nonce: loginData.nonce // Use the new nonce
                })
              });

              const retryLoginData = await retryLoginResponse.json().catch(() => ({ error: 'Login retry failed.' }));
              if (retryLoginResponse.ok && retryLoginData.success && retryLoginData.publicKey) {
                setAuthState({ isAuthenticated: true, isLoading: false, user: { publicKey: retryLoginData.publicKey, wallet: retryLoginData.publicKey }, error: null });
                localStorage.setItem('last_user_pk', retryLoginData.publicKey);
                toast({ variant: 'default', title: 'Login Successful (Retried)', description: `Welcome back! Wallet ${retryLoginData.publicKey.slice(0, 8)}...` });
                return true;
              } else {
                const retryErrMsg = retryLoginData.error || 'Login retry failed.';
                toast({ variant: 'destructive', title: 'Login Failed (Retry)', description: retryErrMsg });
                setAuthState(prev => ({ ...prev, isLoading: false, error: retryErrMsg }));
                throw new Error(retryErrMsg);
              }
            } catch (retrySignError: unknown) {
              const retrySignErrMsg = retrySignError instanceof Error ? retrySignError.message : 'Unknown signing error during retry';
              toast({ variant: 'destructive', title: 'Signature Failed (Retry)', description: retrySignErrMsg });
              setAuthState({ isAuthenticated: false, isLoading: false, user: null, error: retrySignErrMsg });
              throw new Error(retrySignErrMsg);
            }
          }
          toast({ variant: 'destructive', title: 'Login Failed', description: errMsg });
          setAuthState(prev => ({ ...prev, isLoading: false, error: errMsg }));
          throw new Error(errMsg);
        }

        if (loginData.success && loginData.publicKey) {
          performanceMonitor.recordNetworkRequest();
          performanceMonitor.recordLoadTime(Date.now() - startTime);
          setAuthState({ isAuthenticated: true, isLoading: false, user: { publicKey: loginData.publicKey, wallet: loginData.publicKey }, error: null });
          localStorage.setItem('last_user_pk', loginData.publicKey);
          toast({ variant: 'default', title: 'Login Successful', description: `Welcome back! Wallet ${loginData.publicKey.slice(0, 8)}...` });
          return true;
        }
        throw new Error(loginData.error || 'Login failed.');
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown login error';
        setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, user: null, error: errMsg }));
        toast({ variant: 'destructive', title: 'Login Error', description: errMsg });
        throw error;
      } finally {
        loginInProgressRef.current = false;
      }
    } catch (error: unknown) {
      loginInProgressRef.current = false;
      throw error;
    }
  }, [adapterPublicKey, walletSignMessage, connected, logoutAndRedirect, toast, wallet]);

  const registerPasskey = useCallback(async (description: string = 'My Device') => {
    if (!authState.isAuthenticated || !authState.user?.publicKey) {
      toast({ variant: 'destructive', title: 'Error', description: 'You must be logged in with a wallet to register a passkey.' });
      return false;
    }

    if (WebAuthnTransactionManager.isActive()) {
      logger.warn('[AuthContext] A WebAuthn request is already pending. Cancelling current one to prioritize registration.');
      WebAuthnTransactionManager.cancel();
      await new Promise(r => setTimeout(r, 100)); // Short delay for browser to cleanup
    }

    let transactionStarted = false;
    try {
      WebAuthnTransactionManager.start();
      transactionStarted = true;

      const resp = await fetchWithCsrf('/api/auth/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authState.user.publicKey,
          userName: `User ${authState.user.publicKey.slice(0, 8)}...`
        })
      });

      const options = await resp.json();
      if (!resp.ok) throw new Error(options.error || 'Failed to start registration');

      // Native WebAuthn Registration
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: safeBufferFromBase64url(options.challenge),
          user: {
            ...options.user,
            id: safeBufferFromBase64url(options.user.id)
          }
        }
      }) as any;

      if (!credential) throw new Error('Registration cancelled');

      const confirmResp = await fetchWithCsrf('/api/auth/webauthn/register/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authState.user.publicKey,
          description,
          credential: {
            id: credential.id,
            publicKey: (credential as any).response.getPublicKey ?
              uint8ArrayToBase64url(new Uint8Array((credential as any).response.getPublicKey())) : ''
          },
          transports: (credential as any).response.getTransports ? (credential as any).response.getTransports() : []
        })
      });

      if (confirmResp.ok) {
        localStorage.setItem('boby_world_passkey_registered', 'true');
        setHasPasskey(true);
        toast({ title: 'Success!', description: 'Passkey registered successfully. You can now login with biometrics.' });
        return true;
      } else {
        const error = await confirmResp.json();
        throw new Error(error.error || 'Failed to confirm registration');
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError' || err.message?.includes('pending')) {
        logger.log('[AuthContext] Registration aborted, cancelled or pending clash.');
        if (err.name === 'NotAllowedError') {
          toast({ title: 'Registration Cancelled', description: 'Passkey registration was cancelled by the user.' });
        }
      } else {
        logger.error('Passkey registration failed:', err);

        let errorMessage = 'Failed to register passkey.';
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Registration was cancelled or timed out.';
        } else if (err.name === 'InvalidStateError') {
          errorMessage = 'This device is already registered.';
        } else if (err.name === 'NotSupportedError') {
          errorMessage = 'Your browser or device does not support WebAuthn.';
        } else if (err.name === 'TimeoutError') {
          errorMessage = 'The operation timed out. Please try again.';
        } else if (err.message) {
          errorMessage = err.message;
        }

        toast({
          variant: 'destructive',
          title: 'Passkey Error',
          description: errorMessage
        });
      }
      return false;
    } finally {
      if (transactionStarted) {
        WebAuthnTransactionManager.complete();
      }
    }
  }, [authState.isAuthenticated, authState.user, toast]);

  const loginWithPasskey = useCallback(async (preSelectedCredential?: any): Promise<boolean> => {
    // If it's the conditional UI result, it's already done
    if (preSelectedCredential) {
      logger.log("[AuthContext] Proceeding with pre-selected credential.");
    } else {
      if (WebAuthnTransactionManager.isActive()) {
        logger.warn('[AuthContext] A WebAuthn request is already pending.');
        return false;
      }
    }

    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
    let transactionStarted = false;
    try {
      let assertion = preSelectedCredential;
      let finalUserId = localStorage.getItem('last_user_pk') || '';
      let discoveryId: string | undefined = undefined;

      // 1. If we don't have a pre-selected device (manual request), we start the usual process
      if (!assertion) {
        const signal = WebAuthnTransactionManager.start();
        transactionStarted = true;

        // Get Challenge
        const resp = await fetchWithCsrf(`/api/auth/webauthn/authenticate?userId=${finalUserId}`);
        const options = await resp.json();

        // If the request was anonymous (Discovery) we may need the discoveryId
        discoveryId = options.discoveryId;

        // Client-side authentication
        assertion = await navigator.credentials.get({
          publicKey: {
            ...options,
            challenge: safeBufferFromBase64url(options.challenge)
          },
          signal: signal
        }) as any;
      } else {
        // If the device was pre-selected (Conditional UI), we may have gotten discoveryId from the initial request
        // Note: In Conditional UI, the client has already performed get()
        logger.log("[AuthContext] Proceeding with pre-selected credential.");
      }

      if (!assertion) throw new Error('No credential selected');

      // 3. Verify
      const verifyResp = await fetchWithCsrf('/api/auth/webauthn/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: finalUserId || undefined,
          credentialResponse: {
            id: assertion.id,
            response: assertion.response,
            discoveryId: discoveryId
          }
        })
      });

      if (verifyResp.ok) {
        const data = await verifyResp.json();
        setAuthState({ isAuthenticated: true, isLoading: false, user: { publicKey: data.publicKey, wallet: data.publicKey }, error: null });
        toast({ title: 'Welcome Back!', description: 'Logged in successfully with Passkey.' });
        return true;
      }
      throw new Error('Verification failed');
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
        logger.log('[AuthContext] Passkey login aborted or cancelled.');
        setAuthState(prev => ({ ...prev, isLoading: false }));
        if (err.name === 'NotAllowedError') {
          toast({ title: 'Login Cancelled', description: 'Passkey verification was cancelled.' });
        }
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false, error: err.message }));
        toast({ variant: 'destructive', title: 'Passkey Login Failed', description: err.message });
      }
      return false;
    } finally {
      if (transactionStarted) {
        WebAuthnTransactionManager.complete();
      }
    }
  }, [toast]);

  const hasInitialized = useRef(false);

  // Initial session check on mount and periodic refresh
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Initialize offline capabilities
    initializeOfflineCapabilities();
    initializeBackgroundProcessing();

    let sessionCheckInterval: NodeJS.Timeout | null = null;

    const startSessionCheckInterval = () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
      sessionCheckInterval = setInterval(() => {
        logger.log('[AuthContext] Periodically checking session...');
        checkSession();
      }, 12 * 60 * 1000); // 12 minutes
    };

    // Perform initial check ONLY ONCE ever for this browser tab
    if (typeof window !== 'undefined' && !(window as any).__initialAuthCheckStarted) {
      (window as any).__initialAuthCheckStarted = true;
      const start = Date.now();
      logger.log('[AuthContext] Performing the single initial session check.');
      checkSession().then(authenticated => {
        performanceMonitor.recordLoadTime(Date.now() - start);
        if (authenticated) {
          startSessionCheckInterval();
        }
      });
    }

    // Logging daily stats for debugging in console
    logger.log('[AuthContext] Performance Stats:', performanceMonitor.getPerformanceStats());
    logger.log('[AuthContext] Cache Stats:', cacheManager.getCacheStats());
    logger.log('[AuthContext] BackgroundSync Stats:', backgroundSync.getStats());

    // Cleanup on unmount
    return () => {
      if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
      }
    };
  }, [checkSession]);

  // Effect to handle wallet connection changes and enforce mismatch logout
  // Removed problematic useEffect that caused FOUC (Flash of Unauthenticated Content) on reload.
  // The checkSession() function already manages the initial `isLoading` state correctly.
  // Setting it to false here based on momentary !connected state (before wallet adapter init) was premature.
  /*
  useEffect(() => {
    if (!connected && !authState.isAuthenticated && authState.isLoading) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, [connected, authState.isAuthenticated, authState.isLoading]);
  */

  // Restored: Wallet mismatch check (Security Feature)
  useEffect(() => {
    if (authState.isAuthenticated && authState.user && !isWalletConnectedAndMatching && !connecting && !isGracePeriod) {
      logger.warn("[AuthContext] Authenticated session detected with a mismatched or disconnected wallet. Forcing logout.");
      logoutAndRedirect('/');
      toast({ variant: 'destructive', title: 'Wallet Mismatch', description: 'Your connected wallet does not match the session.' });
    }
  }, [isGracePeriod, authState.isAuthenticated, authState.user, isWalletConnectedAndMatching, connecting, logoutAndRedirect, toast]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    isWalletConnectedAndMatching,
    logoutAndRedirect,
    retrySessionCheck,
    triggerSessionRefresh,
    registerPasskey,
    loginWithPasskey,
    hasPasskey,
    securityLevel: hasPasskey ? 'Maximum' : (authState.isAuthenticated ? 'Enhanced' : 'Standard'),
    isOnline,
    performanceStats: performanceMonitor.getPerformanceStats()
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
