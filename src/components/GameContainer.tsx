'use client';

import React, { useState, useEffect, useCallback } from 'react';
import GameUI from '@/components/game/GameUI';
import CaptchaScreen from '@/components/game-bootstrap/CaptchaScreen';
import AuthenticationScreen from '@/components/game-bootstrap/AuthenticationScreen';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';

import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { ADMIN_WALLET_ADDRESS, RECAPTCHA_SITE_KEY } from '@/lib/constants';

const GameContainer: React.FC = () => {
    const { 
        isAuthenticated,
        setIsAuthenticated,
        user: authUser,
        setAuthUser,
        isLoading: isLoadingAuth,
        login: loginAuthHook,
        logout: logoutAuthSessionHook,
        error: authErrorFromContext,// Get error from context
        checkSession
    } = useAuth();
    
    const { 
        disconnectFromSession: disconnectWalletAdapterSession
    } = useSessionWallet();
    
    const router = useRouter();
    const pathname = usePathname(); // Get current path for potential redirects
    const { toast } = useToast();

    const [captchaVerified, setCaptchaVerified] = useState(false);
    const [isRequestingNonce, setIsRequestingNonce] = useState(false); 
    const [isLoadingGameResources, setIsLoadingGameResources] = useState(false);
    const [isRedirectingToAdmin, setIsRedirectingToAdmin] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);

    const siteKey = RECAPTCHA_SITE_KEY;


    useEffect(() => {
    const runSessionCheck = async () => {
      setIsCheckingSession(true);
      const sessionValid = await checkSession();
      setCaptchaVerified(sessionValid);
      // هنا يمكن تحديث AuthUser و IsAuthenticated تلقائيًا ضمن checkSession في AuthContext
      setIsCheckingSession(false);
    };
    runSessionCheck();
  }, [checkSession]);

    const handleCaptchaSuccess = useCallback(() => {
        console.log("[GameContainer] Captcha verified successfully.");
        setCaptchaVerified(true);
        toast({ title: 'Verification Successful', description: 'You can now connect your wallet.', duration: 3000 });
    }, [toast]);

    const handleLoginAttempt = useCallback(async () => {
        if (!captchaVerified || isRequestingNonce) return;
        setIsRequestingNonce(true);
        console.log("[GameContainer] Attempting login via useAuth.login()...");
        try {
            const loginSuccess = await loginAuthHook(); 
            if (loginSuccess) {
                console.log("[GameContainer] Login successful. Admin/resource loading check will follow.");
            } else {
                 console.warn("[GameContainer] loginAuthHook returned false without throwing an error. This is unexpected.");
                 toast({ title: "Login Failed", description: "An unexpected issue occurred during login.", variant: "destructive" });
            }
        } catch (error: any) {
            console.error(`[GameContainer] Login attempt failed: ${error.message}`);
            toast({ 
                title: "Login Failed", 
                description: error.message || "Could not authenticate with the server. Check console for details.", 
                variant: "destructive" 
            });
        } finally {
        setIsRequestingNonce(false);
    }
}, [loginAuthHook, toast, captchaVerified, isRequestingNonce]);
    
    const handleDisconnect = useCallback(async () => {
        toast({ title: "Disconnecting...", description: "Attempting to end your session." });
        try {
            console.log("[GameContainer] Attempting logoutAuthSession (clears global auth state & local)...");
            await logoutAuthSessionHook();
            console.log("[GameContainer] logoutAuthSession completed.");

            console.log("[GameContainer] Attempting disconnectWalletAdapter (disconnects wallet from site)...");
            await disconnectWalletAdapterSession();
            console.log("[GameContainer] disconnectWalletAdapter completed.");
            
            setCaptchaVerified(false); 
            setIsLoadingGameResources(false); 
            setIsRedirectingToAdmin(false); 
            setIsRequestingNonce(false); 


            toast({ title: "Disconnected", description: "Session ended. Please re-verify CAPTCHA to connect again.", duration: 3000 });
        } catch (error: any) {
            console.error("[GameContainer] Error during full disconnect process:", error);
            toast({
                title: "Disconnection Error",
                description: `An error occurred: ${error.message || 'Unknown error'}.`,
                variant: "destructive",
                duration: 5000,
            });
        }
    }, [logoutAuthSessionHook, disconnectWalletAdapterSession, toast]);


    useEffect(() => {
        console.log("[GameContainer] Component mounted.");
    }, []);

       /* // تحقق من الجلسة عند تحميل الصفحة
        useEffect(() => {
            const checkSession = async () => {
                try {
                    const response = await fetch('/api/auth/session', {
                        method: 'GET',
                        credentials: 'include',
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.authenticated && data.user && data.user.wallet) {
                            setCaptchaVerified(true);
                            setIsAuthenticated(true);
                            setAuthUser({ wallet: data.user.wallet, publicKey: data.user.wallet });
                        } else {
                            setCaptchaVerified(false);
                            setIsAuthenticated(false);
                            setAuthUser(null);
                        }
                    } else {
                        setCaptchaVerified(false);
                        setIsAuthenticated(false);
                        setAuthUser(null);
                    }
                } catch {
                    setCaptchaVerified(false);
                    setIsAuthenticated(false);
                    setAuthUser(null);
                } finally {
                    setIsCheckingSession(false);
                }
            };
            checkSession();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
*/

    useEffect(() => {
        if (isLoadingAuth) {
            console.log("[GameContainer] Global Auth is loading, deferring admin/game resource decisions.");
            return;
        }

        console.log(`[GameContainer] Auth state updated. IsAuth: ${isAuthenticated}, UserPK: ${authUser?.publicKey}, AdminPK: ${ADMIN_WALLET_ADDRESS}, Current Path: ${pathname}`);

        if (isAuthenticated && authUser?.publicKey) {
            if (authUser.publicKey === ADMIN_WALLET_ADDRESS) {
                if (!isRedirectingToAdmin && pathname !== '/admin') {
                    console.log("[GameContainer] Admin user detected via global auth. Redirecting to /admin.");
                    setIsRedirectingToAdmin(true);
                    router.push('/admin');
                }
            } else { 
                if (!isLoadingGameResources && !isGameUIVisible()) { 
                    console.log("[GameContainer] Authenticated as regular user via global auth. Loading game resources...");
                    setIsLoadingGameResources(true);
                    const timer = setTimeout(() => {
                        setIsLoadingGameResources(false);
                        console.log("[GameContainer] Finished loading game resources (simulated).");
                    }, 1500);
                    return () => clearTimeout(timer);
                }
            }
        } else { 
            if (isLoadingGameResources) setIsLoadingGameResources(false);
            if (isRedirectingToAdmin) setIsRedirectingToAdmin(false);
            // captchaVerified is reset by handleDisconnect
        }
    }, [isAuthenticated, authUser, isLoadingAuth, pathname, isRedirectingToAdmin, isLoadingGameResources, ADMIN_WALLET_ADDRESS]);


    const isGameUIVisible = () => isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isLoadingGameResources && !isRedirectingToAdmin;

    if (isCheckingSession) {
        return <LoadingScreen message="Checking session..." showLogo />;
    }
    if (!siteKey) {
        console.log("[GameContainer] Waiting for CAPTCHA site key to be ready...");
        return <LoadingScreen message="Preparing verification..." showLogo />;
    }
    if (!captchaVerified) {
        console.log("[GameContainer] Awaiting captcha verification.");
        return <CaptchaScreen siteKey={siteKey!} onVerificationSuccess={handleCaptchaSuccess} />;
    }
    if (isLoadingAuth && !authUser) { 
        console.log("[GameContainer] Waiting for authentication to complete.");
        return <LoadingScreen message="Processing authentication..." showLogo />;
    }
    if (isRedirectingToAdmin) {
        console.log("[GameContainer] Redirecting to admin panel...");
        return <LoadingScreen message="Redirecting to admin panel..." showLogo />;
    }
    if (!isAuthenticated) {
        console.log("[GameContainer] User not authenticated. Showing AuthenticationScreen.");
        return <AuthenticationScreen onRequestDisconnect={handleDisconnect} onLoginAttempt={handleLoginAttempt} captchaVerified={captchaVerified} />;
    }
    if (authUser?.publicKey !== ADMIN_WALLET_ADDRESS) {
        if (isLoadingGameResources) {
            console.log("[GameContainer] Loading game resources for regular user.");
            return <LoadingScreen message="Loading game resources..." showLogo />;
        }
        if (isGameUIVisible()) {
            console.log("[GameContainer] Showing GameUI for regular user.");
            return <GameUI />;
        }
    }
    if (authUser?.publicKey === ADMIN_WALLET_ADDRESS && !isRedirectingToAdmin) {
      console.log("[GameContainer] Admin user authenticated, but not yet redirected. Showing loading/finalizing screen.");
      return <LoadingScreen message="Finalizing admin setup..." showLogo />;
    }
    console.log("[GameContainer] Finalizing setup. Showing default loading screen.");
    return <LoadingScreen message="Finalizing setup..." showLogo />;
};

export default GameContainer;