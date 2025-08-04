'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameUI from '@/components/game/GameUI';
import GameMainMenu from '@/components/game/GameMainMenu';
import RunningGameUI from '@/components/game/RunningGameUI';
import SoundManager, { SoundManagerProps, SoundManagerRef } from '@/components/game/SoundManager';
import CaptchaScreen from '@/components/game-bootstrap/CaptchaScreen';
import AuthenticationScreen from '@/components/game-bootstrap/AuthenticationScreen';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import { Octree } from '@/lib/Octree';

import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { ADMIN_WALLET_ADDRESS, RECAPTCHA_SITE_KEY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';

const GameContainer: React.FC = () => {
    const { 
        isAuthenticated,
        user: authUser,
        isLoading: isLoadingAuth,
        login: loginAuthHook,
        logout: logoutAuthSessionHook,
        error: authErrorFromContext,
        checkSession,
        isWalletConnectedAndMatching,
        logoutAndRedirect,
        retrySessionCheck
    } = useAuth();
    
    const { 
        disconnectFromSession: disconnectWalletAdapterSession
    } = useSessionWallet();
    
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();

    const octreeRef = useRef<Octree | null>(null);

    const [captchaVerified, setCaptchaVerified] = useState(false);
    const [isRequestingNonce, setIsRequestingNonce] = useState(false); 
    const [isLoadingGameResources, setIsLoadingGameResources] = useState(false);
    const [isRedirectingToAdmin, setIsRedirectingToAdmin] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [selectedGameMode, setSelectedGameMode] = useState<'none' | 'boby-world' | 'running-game'>('none');
    const [isMuted, setIsMuted] = useState(false);
    const soundManagerRef = useRef<SoundManagerRef | null>(null);

    const siteKey = RECAPTCHA_SITE_KEY;

    // All useEffects and Callbacks are declared at the top level
    useEffect(() => {
        const runSessionCheck = async () => {
            setIsCheckingSession(true);
            console.log("[GameContainer] Initial session check initiated.");
            try {
              const sessionValid = await checkSession();
              if (sessionValid) {
                  setCaptchaVerified(true);
                  console.log("[GameContainer] Initial session check successful. Captcha marked as verified.");
              } else if (isAuthenticated) {
                  toast({
                    title: "Session Expired",
                    description: "Your session is invalid or expired. Please log in again.",
                    variant: "destructive"
                  });
                  setCaptchaVerified(false);
              } else {
                  console.log("[GameContainer] Initial session check failed or no active session.");
                  setCaptchaVerified(false);
              }
            } catch (error: any) {
              console.error("[GameContainer] Session check error:", error);
              toast({
                title: "Network Error",
                description: "Failed to validate session. Retrying...",
                variant: "destructive",
                duration: 4000,
              });
              setTimeout(() => {
                checkSession();
              }, 3000);
            } finally {
              setIsCheckingSession(false);
            }
        };
        runSessionCheck();
    }, [checkSession, isAuthenticated, toast]);

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
                toast({ title: "Login Successful", description: "Welcome to Boby's World!", duration: 3000 });
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
                console.log("[GameContainer] Authenticated as regular user. State will be managed by selectedGameMode effect.");
            }
        } else { 
            if (isLoadingGameResources) setIsLoadingGameResources(false);
            if (isRedirectingToAdmin) setIsRedirectingToAdmin(false);
            setSelectedGameMode('none');
        }
    }, [isAuthenticated, authUser, isLoadingAuth, isWalletConnectedAndMatching, pathname, isRedirectingToAdmin, ADMIN_WALLET_ADDRESS]);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (isAuthenticated && authUser?.publicKey && authUser.publicKey !== ADMIN_WALLET_ADDRESS && selectedGameMode !== 'none') {
            console.log(`[GameContainer] Authenticated as regular user. Loading resources for ${selectedGameMode} mode...`);
            setIsLoadingGameResources(true);
            timer = setTimeout(() => {
                setIsLoadingGameResources(false);
                console.log(`[GameContainer] Finished loading resources for ${selectedGameMode} mode (simulated).`);
            }, 1500);
        } else if (selectedGameMode === 'none' && isLoadingGameResources) {
            setIsLoadingGameResources(false);
            if (timer) clearTimeout(timer);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [selectedGameMode, isAuthenticated, authUser, ADMIN_WALLET_ADDRESS]);

    const isGameUIVisible = useCallback(() => isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isLoadingGameResources && !isRedirectingToAdmin && selectedGameMode !== 'none', [isAuthenticated, authUser, isLoadingGameResources, isRedirectingToAdmin, selectedGameMode]);

    const handleGameModeSelected = useCallback((mode: 'boby-world' | 'running-game') => {
        console.log(`[GameContainer] Game mode selected: ${mode}`);
        setSelectedGameMode(mode);
    }, []);

    useEffect(() => {
        if (isAuthenticated && authUser && !isWalletConnectedAndMatching) {
            console.warn("[GameContainer] Authenticated session detected with a mismatched or disconnected wallet. Forcing logout and redirect.");
            logoutAndRedirect('/');
        }
    }, [isAuthenticated, authUser, isWalletConnectedAndMatching, logoutAndRedirect]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const newState = !prev;
            if (soundManagerRef.current) {
                soundManagerRef.current.toggleMute();
            }
            return newState;
        });
    }, []);

    useEffect(() => {
        const handleFirstInteraction = () => {
            if (soundManagerRef.current) {
                soundManagerRef.current.playCurrentTrack();
            }
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
        };

        window.addEventListener('click', handleFirstInteraction);
        window.addEventListener('keydown', handleFirstInteraction);

        return () => {
            window.removeEventListener('click', handleFirstInteraction);
            window.removeEventListener('keydown', handleFirstInteraction);
        };
    }, []);

    // Determine the current screen for SoundManager
    let currentScreenForSound: SoundManagerProps['currentScreen'];
    if (isCheckingSession || !siteKey) {
        currentScreenForSound = 'loading';
    } else if (!captchaVerified) {
        currentScreenForSound = 'captcha';
    } else if (!isAuthenticated) {
        currentScreenForSound = 'authentication';
    } else if (authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
        currentScreenForSound = 'admin';
    } else if (selectedGameMode === 'none') {
        currentScreenForSound = 'mainMenu';
    } else if (isLoadingGameResources) {
        currentScreenForSound = 'loading';
    } else if (selectedGameMode === 'boby-world') {
        currentScreenForSound = 'boby-world';
    } else if (selectedGameMode === 'running-game') {
        currentScreenForSound = 'running-game';
    } else {
        currentScreenForSound = 'loading'; // Fallback
    }

    // Main content rendering logic
    let mainContent;
    if (isCheckingSession) {
        console.log("[GameContainer] Displaying: Checking session...");
        mainContent = <LoadingScreen message="" showLogo />;
    } else if (!siteKey) {
        console.log("[GameContainer] Displaying: Preparing verification (no CAPTCHA site key).");
        mainContent = <LoadingScreen message="Preparing verification..." showLogo />;
    } else if (!captchaVerified) {
        console.log("[GameContainer] Displaying: Awaiting captcha verification.");
        mainContent = <CaptchaScreen siteKey={siteKey!} onVerificationSuccess={handleCaptchaSuccess} />;
    } else if (!isAuthenticated) {
        console.log("[GameContainer] Displaying: Not authenticated. Showing AuthenticationScreen.");
        mainContent = <AuthenticationScreen onRequestDisconnect={handleDisconnect} onLoginAttempt={handleLoginAttempt} captchaVerified={captchaVerified} />;
    } else if (authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
        if (!isRedirectingToAdmin) {
            console.log("[GameContainer] Admin user authenticated, initiating redirect.");
            mainContent = <LoadingScreen message="Redirecting to admin panel..." showLogo />;
        } else {
            console.log("[GameContainer] Displaying: Redirecting to admin panel...");
            mainContent = <LoadingScreen message="Redirecting to admin panel..." showLogo />;
        }
    } else if (selectedGameMode === 'none') {
        console.log("[GameContainer] Displaying: Authenticated. Showing GameMainMenu for mode selection.");
        mainContent = <GameMainMenu onGameModeSelected={handleGameModeSelected} />;
    } else if (isLoadingGameResources) {
        console.log("[GameContainer] Displaying: Loading game resources for regular user.");
        mainContent = <LoadingScreen message="Loading game resources..." showLogo />;
    } else if (isGameUIVisible()) {
        if (selectedGameMode === 'boby-world') {
            console.log("[GameContainer] Displaying: Boby's World GameUI for regular user.");
            mainContent = <GameUI octreeRef={octreeRef} />;
        } else if (selectedGameMode === 'running-game') {
            console.log("[GameContainer] Displaying: Running Game UI for regular user.");
            mainContent = <RunningGameUI />;
        }
    } else {
        console.log("[GameContainer] Fallback: Showing default loading screen (should not be reached often).");
        mainContent = <LoadingScreen message="Finalizing setup..." showLogo />;
    }

    return (
        <>
            <SoundManager currentScreen={currentScreenForSound} isMuted={isMuted} ref={soundManagerRef} />
            {/* Mute/Unmute Button */}
            <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000 }}>
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={toggleMute}
                    aria-label={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
            </div>
            {mainContent}
        </>
    );
};

export default GameContainer;
