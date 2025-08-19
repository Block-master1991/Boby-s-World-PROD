'use client';

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameUI from '@/components/game/GameUI';
import GameMainMenu from '@/components/game/GameMainMenu';
import RunningGameUI from '@/components/game/RunningGameUI';
import CaptchaScreen from '@/components/game-bootstrap/CaptchaScreen';
import AuthenticationScreen from '@/components/game-bootstrap/AuthenticationScreen';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import GameLoadingOverlay from '@/components/game-bootstrap/GameLoadingOverlay';
import { Octree } from '@/lib/Octree';
// import { useGameAssetLoader } from '@/hooks/useGameAssetLoader'; // No longer needed here

import { GameObject } from '@/types/game';

import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { ADMIN_WALLET_ADDRESS, RECAPTCHA_SITE_KEY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; // Import useAudio

const GameContainer: React.FC = () => {
    const { 
        isAuthenticated,
        user: authUser,
        isLoading: isLoadingAuth,
        login: loginAuthHook,
        logout: logoutAuthSessionHook,
        checkSession,
        isWalletConnectedAndMatching,
        logoutAndRedirect,
    } = useAuth();
    
    const { 
        disconnectFromSession: disconnectWalletAdapterSession
    } = useSessionWallet();
    
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();

    const octreeRef = useRef<Octree<GameObject> | null>(null);

    const [captchaVerified, setCaptchaVerified] = useState(false);
    const [isRequestingNonce, setIsRequestingNonce] = useState(false); 
    const [isLoadingGameResources, setIsLoadingGameResources] = useState(false); // Re-introducing for manual control
    const [loadProgress, setLoadProgress] = useState(0); // State for progress
    const [assetLoadError, setAssetLoadError] = useState<string | null>(null); // State for error
    const [isRedirectingToAdmin, setIsRedirectingToAdmin] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(true);
    const [selectedGameMode, setSelectedGameMode] = useState<'none' | 'boby-world' | 'running-game'>('none');
    const [showEnableSoundButton, setShowEnableSoundButton] = useState(false); // New state for fallback UI

    const { soundManagerRef, isMuted, toggleMute, setHasUserInteracted, setCurrentScreen } = useAudio(); // Use AudioContext

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
            } catch (error: unknown) {
              console.error("[GameContainer] Session check error:", error);
              toast({
                title: "Network Error",
                description: (error instanceof Error) ? error.message : "Failed to validate session. Retrying...",
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
        setHasUserInteracted(true); // User interaction point
        soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
        toast({ title: 'Verification Successful', description: 'You can now connect your wallet.', duration: 3000 });
    }, [toast, setHasUserInteracted, soundManagerRef]);

    const handleLoginAttempt = useCallback(async () => {
        if (!captchaVerified || isRequestingNonce) return;
        setIsRequestingNonce(true);
        console.log("[GameContainer] Attempting login via useAuth.login()...");
        try {
            const loginSuccess = await loginAuthHook(); 
            if (loginSuccess) {
                console.log("[GameContainer] Login successful. Admin/resource loading check will follow.");
                setHasUserInteracted(true); // User interaction point
                soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
                toast({ title: "Login Successful", description: "Welcome to Boby World!", duration: 3000 });
            } else {
                 console.warn("[GameContainer] loginAuthHook returned false without throwing an error. This is unexpected.");
                 toast({ title: "Login Failed", description: "An unexpected issue occurred during login.", variant: "destructive" });
            }
        } catch (error: unknown) {
            console.error(`[GameContainer] Login attempt failed: ${(error instanceof Error) ? error.message : 'Unknown error'}`);
            toast({ 
                title: "Login Failed", 
                description: (error instanceof Error) ? error.message : "Could not authenticate with the server. Check console for details.", 
                variant: "destructive" 
            });
        } finally {
        setIsRequestingNonce(false);
    }
}, [loginAuthHook, toast, captchaVerified, isRequestingNonce, setHasUserInteracted, soundManagerRef]);
    
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
            // setIsLoadingGameResources(false); // This is now managed by the asset loader hook
            setIsRedirectingToAdmin(false); 
            setIsRequestingNonce(false); 
            setHasUserInteracted(false); // Reset user interaction state on disconnect
            setShowEnableSoundButton(false); // Reset sound button state


            toast({ title: "Disconnected", description: "Session ended. Please re-verify CAPTCHA to connect again.", duration: 3000 });
        } catch (error: unknown) {
            console.error("[GameContainer] Error during full disconnect process:", error);
            toast({
                title: "Disconnection Error",
                description: `An error occurred: ${(error instanceof Error) ? error.message : 'Unknown error'}.`,
                variant: "destructive",
                duration: 5000,
            });
        }
    }, [logoutAuthSessionHook, disconnectWalletAdapterSession, toast, setHasUserInteracted]);

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
            // if (isLoadingGameResources) setIsLoadingGameResources(false); // Managed by asset loader
            if (isRedirectingToAdmin) setIsRedirectingToAdmin(false);
            setSelectedGameMode('none');
        }
    }, [isAuthenticated, authUser, isLoadingAuth, isWalletConnectedAndMatching, pathname, isRedirectingToAdmin, router]);

    // The problematic useEffect has been removed.
    // The loading state will be controlled entirely by the callbacks from the child components.

    const isGameUIVisible = useCallback(() => isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isRedirectingToAdmin && selectedGameMode !== 'none', [isAuthenticated, authUser, isRedirectingToAdmin, selectedGameMode]);

    const handleGameModeSelected = useCallback((mode: 'boby-world' | 'running-game') => {
        console.log(`[GameContainer] Game mode selected: ${mode}`);
        setSelectedGameMode(mode);
        setHasUserInteracted(true); // User interaction point
        soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
    }, [setHasUserInteracted, soundManagerRef]);

    // Callbacks to be passed down to the game component
    const handleLoadStart = useCallback(() => {
        console.log("[GameContainer] Received load start signal from child.");
        setIsLoadingGameResources(true);
        setLoadProgress(0);
    }, []);

    const handleLoadProgress = useCallback((progress: number) => {
        // console.log(`[GameContainer] Received progress update: ${progress}%`);
        setLoadProgress(progress);
    }, []);

    const handleLoadComplete = useCallback((success: boolean) => {
        console.log(`[GameContainer] Received load complete signal. Success: ${success}`);
        if (success) {
            setLoadProgress(100);
            // A small delay to show 100% before hiding the screen
            setTimeout(() => {
                setIsLoadingGameResources(false);
            }, 500);
        } else {
            setAssetLoadError("Failed to load game assets. Please try refreshing the page.");
            setIsLoadingGameResources(false); // Stop loading on failure
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && authUser && !isWalletConnectedAndMatching) {
            console.warn("[GameContainer] Authenticated session detected with a mismatched or disconnected wallet. Forcing logout and redirect.");
            logoutAndRedirect('/');
        }
    }, [isAuthenticated, authUser, isWalletConnectedAndMatching, logoutAndRedirect]);

    // This useEffect now primarily sets hasUserInteracted on any initial click/keydown
    useEffect(() => {
        const handleInitialInteraction = () => {
            setHasUserInteracted(true);
            window.removeEventListener('click', handleInitialInteraction);
            window.removeEventListener('keydown', handleInitialInteraction);
        };

        window.addEventListener('click', handleInitialInteraction);
        window.addEventListener('keydown', handleInitialInteraction);

        return () => {
            window.removeEventListener('click', handleInitialInteraction);
            window.removeEventListener('keydown', handleInitialInteraction);
        };
    }, [setHasUserInteracted]);


    const handleEnableSoundClick = useCallback(() => {
        if (soundManagerRef.current) {
            soundManagerRef.current.playCurrentTrack();
            setShowEnableSoundButton(false); // Hide button after attempting to play
        }
    }, [soundManagerRef]);

    // Determine the current screen for SoundManager and update context
    useEffect(() => {
        let screen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin';
        if (isCheckingSession || !siteKey) {
            screen = 'loading';
        } else if (!captchaVerified) {
            screen = 'captcha';
        } else if (!isAuthenticated) {
            screen = 'authentication';
        } else if (authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
            screen = 'admin';
        } else if (selectedGameMode === 'none') {
            screen = 'mainMenu';
        } else if (isLoadingGameResources) {
            screen = 'loading';
        } else if (selectedGameMode === 'boby-world') {
            screen = 'boby-world';
        } else if (selectedGameMode === 'running-game') {
            screen = 'running-game';
        } else {
            screen = 'loading'; // Fallback
        }
        setCurrentScreen(screen);
    }, [isCheckingSession, siteKey, captchaVerified, isAuthenticated, authUser, selectedGameMode, isLoadingGameResources, setCurrentScreen]);


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
    } else if (isGameUIVisible()) {
        // This is the new logic: Render the game UI, and conditionally render the loading screen as an overlay.
        if (selectedGameMode === 'boby-world') {
            console.log("[GameContainer] Displaying: Boby World GameUI for regular user.");
            mainContent = (
                <>
                    <GameUI 
                        octreeRef={octreeRef} 
                        onLoadStart={handleLoadStart}
                        onLoadProgress={handleLoadProgress}
                        onLoadComplete={handleLoadComplete}
                    />
                    <GameLoadingOverlay isLoading={isLoadingGameResources} progress={loadProgress} error={assetLoadError} />
                </>
            );
        } else if (selectedGameMode === 'running-game') {
            console.log("[GameContainer] Displaying: Running Game UI for regular user.");
            mainContent = <RunningGameUI />; // Assuming this one doesn't need the loading logic for now
        }
    } else {
        // Fallback if no other condition is met. This might happen briefly during state transitions.
        console.log("[GameContainer] Fallback: No specific content to render, showing loading screen.");
        mainContent = <LoadingScreen message="Finalizing setup..." showLogo />;
    }

    return (
        <>
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
            {showEnableSoundButton && (
                <div style={{ position: 'fixed', bottom: '80px', right: '20px', zIndex: 1000 }}>
                    <Button onClick={handleEnableSoundClick}>
                        Enable Sound
                    </Button>
                </div>
            )}
            {mainContent}
        </>
    );
};

export default GameContainer;
