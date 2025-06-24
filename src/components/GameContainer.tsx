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
        user: authUser,
        isLoading: isLoadingAuth,
        login: loginAuthHook,
        logout: logoutAuthSessionHook,
        error: authErrorFromContext,
        checkSession,
        isWalletConnectedAndMatching // Use the new derived state
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
            console.log("[GameContainer] Initial session check initiated.");
            const sessionValid = await checkSession();
            // If session is valid, we can consider captcha verified for flow purposes
            if (sessionValid) {
                setCaptchaVerified(true);
                console.log("[GameContainer] Initial session check successful. Captcha marked as verified.");
            } else {
                console.log("[GameContainer] Initial session check failed or no active session.");
                setCaptchaVerified(false); // Ensure captcha is reset if no valid session
            }
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
            console.log("[GameContainer] AuthContext is loading, deferring admin/game resource decisions.");
            return;
        }

        console.log(`[GameContainer] Auth state updated. IsAuth: ${isAuthenticated}, UserPK: ${authUser?.publicKey}, WalletConnectedAndMatching: ${isWalletConnectedAndMatching}, AdminPK: ${ADMIN_WALLET_ADDRESS}, Current Path: ${pathname}`);

        if (isAuthenticated && authUser?.publicKey) {
            if (authUser.publicKey === ADMIN_WALLET_ADDRESS) {
                if (!isRedirectingToAdmin && pathname !== '/admin') {
                    console.log("[GameContainer] Admin user detected. Redirecting to /admin.");
                    setIsRedirectingToAdmin(true);
                    router.push('/admin');
                }
            } else { 
                // Regular user authenticated
                if (!isLoadingGameResources && !isGameUIVisible()) { 
                    console.log("[GameContainer] Authenticated as regular user. Loading game resources...");
                    setIsLoadingGameResources(true);
                    const timer = setTimeout(() => {
                        setIsLoadingGameResources(false);
                        console.log("[GameContainer] Finished loading game resources (simulated).");
                    }, 1500);
                    return () => clearTimeout(timer);
                }
            }
        } else { 
            // Not authenticated or authUser is null
            if (isLoadingGameResources) setIsLoadingGameResources(false);
            if (isRedirectingToAdmin) setIsRedirectingToAdmin(false);
            // captchaVerified is reset by handleDisconnect or if checkSession fails
        }
    }, [isAuthenticated, authUser, isLoadingAuth, isWalletConnectedAndMatching, pathname, isRedirectingToAdmin, isLoadingGameResources, ADMIN_WALLET_ADDRESS]);


    // Determine if GameUI should be visible
    const isGameUIVisible = () => isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isLoadingGameResources && !isRedirectingToAdmin;

    // Render logic based on authentication and loading states
    if (isCheckingSession) {
        console.log("[GameContainer] Displaying: Checking session...");
        return <LoadingScreen message="Checking session..." showLogo />;
    }
    if (!siteKey) {
        console.log("[GameContainer] Displaying: Preparing verification (no CAPTCHA site key).");
        return <LoadingScreen message="Preparing verification..." showLogo />;
    }
    if (!captchaVerified) {
        console.log("[GameContainer] Displaying: Awaiting captcha verification.");
        return <CaptchaScreen siteKey={siteKey!} onVerificationSuccess={handleCaptchaSuccess} />;
    }
    
    // If authenticated, but wallet is not connected or mismatched, show AuthenticationScreen
    // This allows the user to reconnect the correct wallet without re-logging in
    if (isAuthenticated && authUser && !isWalletConnectedAndMatching) {
        console.log("[GameContainer] Displaying: Authenticated but wallet mismatch/disconnected. Showing AuthenticationScreen.");
        return <AuthenticationScreen onRequestDisconnect={handleDisconnect} onLoginAttempt={handleLoginAttempt} captchaVerified={captchaVerified} />;
    }

    // If not authenticated at all, show AuthenticationScreen
    if (!isAuthenticated) {
        console.log("[GameContainer] Displaying: Not authenticated. Showing AuthenticationScreen.");
        return <AuthenticationScreen onRequestDisconnect={handleDisconnect} onLoginAttempt={handleLoginAttempt} captchaVerified={captchaVerified} />;
    }

    // If authenticated as admin, redirect
    if (isAuthenticated && authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
        if (!isRedirectingToAdmin) { // This state should trigger the useEffect above
            console.log("[GameContainer] Admin user authenticated, initiating redirect.");
            return <LoadingScreen message="Redirecting to admin panel..." showLogo />;
        }
        console.log("[GameContainer] Displaying: Redirecting to admin panel...");
        return <LoadingScreen message="Redirecting to admin panel..." showLogo />;
    }

    // If authenticated as regular user and game resources are loading
    if (isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && isLoadingGameResources) {
        console.log("[GameContainer] Displaying: Loading game resources for regular user.");
        return <LoadingScreen message="Loading game resources..." showLogo />;
    }

    // If all conditions met, show GameUI
    if (isGameUIVisible()) {
        console.log("[GameContainer] Displaying: GameUI for regular user.");
        return <GameUI />;
    }

    console.log("[GameContainer] Fallback: Showing default loading screen (should not be reached often).");
    return <LoadingScreen message="Finalizing setup..." showLogo />;
};

export default GameContainer;
