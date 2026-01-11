'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { Octree } from '@/lib/Octree';

import { initialAssetPreloader } from '@/lib/initialAssetPreloader';

// Lazy load heavy components
const LoadingScreen = dynamic(() => import('@/components/game-bootstrap/LoadingScreen'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const GameUI = dynamic(() => import('@/components/game/GameUI'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const InitialAssetLoader = dynamic(() => import('@/components/InitialAssetLoader'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const GameMainMenu = dynamic(() => import('@/components/game/GameMainMenu'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const RunningGameUI = dynamic(() => import('@/components/game/RunningGameUI'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const CaptchaScreen = dynamic(() => import('@/components/game-bootstrap/CaptchaScreen'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const AuthenticationScreen = dynamic(() => import('@/components/game-bootstrap/AuthenticationScreen'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});

const GameLoadingOverlay = dynamic(() => import('@/components/game-bootstrap/GameLoadingOverlay'), {
    ssr: false,
    loading: () => <LoadingScreen variant="indeterminate" />
});
// import { useGameAssetLoader } from '@/hooks/useGameAssetLoader'; // No longer needed here

import type { GameObject } from '@/types/game';

import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname } from 'next/navigation';
import { ADMIN_WALLET_ADDRESS, RECAPTCHA_SITE_KEY } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import { useAudio } from '@/contexts/AudioContext'; // Import useAudio
import { logger } from '@/utils/logger';

export interface GameContainerProps {
    captchaVerified: boolean;
}

const GameContainer: React.FC<GameContainerProps> = ({ captchaVerified: initialCaptchaVerified }) => {
    // We use the prop but also keep a local ref if connectivity issues occur,
    // though the parent should handle the source of truth perfectly now.
    const [captchaVerified, setCaptchaVerified] = useState(initialCaptchaVerified);

    useEffect(() => {
        setCaptchaVerified(initialCaptchaVerified);
    }, [initialCaptchaVerified]);
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
        sessionPublicKey,
        disconnectFromSession: disconnectWalletAdapterSession
    } = useSessionWallet();

    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();

    const octreeRef = useRef<Octree<GameObject> | null>(null);

    const [isRequestingNonce, setIsRequestingNonce] = useState(false);
    const [isLoadingGameResources, setIsLoadingGameResources] = useState(false); // Re-introducing for manual control
    const [loadProgress, setLoadProgress] = useState(0); // State for progress
    const [loadPhase, setLoadPhase] = useState<string>('system'); // State for current loading phase
    const [currentAsset, setCurrentAsset] = useState<string | undefined>(); // State for current loading asset
    const [loadedAssetsCount, setLoadedAssetsCount] = useState<number | undefined>(); // State for loaded assets count
    const [totalAssetsCount, setTotalAssetsCount] = useState<number | undefined>(); // State for total assets count
    const [assetLoadError, setAssetLoadError] = useState<string | null>(null); // State for error
    const [isRedirectingToAdmin, setIsRedirectingToAdmin] = useState(false);
    const [selectedGameMode, setSelectedGameMode] = useState<'none' | 'boby-world' | 'running-game'>('none');
    const [showEnableSoundButton, setShowEnableSoundButton] = useState(false); // New state for fallback UI
    const [isSoundPlaying, setIsSoundPlaying] = useState(false); // Track if sound is actively playing
    const [assetPreloadComplete, setAssetPreloadComplete] = useState(false); // Track if initial asset preload is complete
    const [areSheetsOpen, setAreSheetsOpen] = useState(false); // Track if any sheets are open in GameUI

    // GameUI loading states
    const [isGameUILoading, setIsGameUILoading] = useState(false);
    const [gameUILoadProgress, setGameUILoadProgress] = useState(0);

    const { soundManagerRef, isMuted, toggleMute, setHasUserInteracted, setCurrentScreen } = useAudio(); // Use AudioContext

    // Use AuthContext's isLoading state to manage the loading overlay used to invoke setISCheckingSession here


    // We no longer perform an explicit checkSession() here because AuthContext handles the initial check on mount.
    // We just listen to the isAuthenticated state from useAuth().
    useEffect(() => {
        if (isAuthenticated && !captchaVerified) {
            setCaptchaVerified(true);
        }
    }, [isAuthenticated, captchaVerified]);

    // Captcha management moved to ClientGameContainer

    const handleLoginAttempt = useCallback(async () => {
        if (!captchaVerified || isRequestingNonce) return;
        setIsRequestingNonce(true);
        logger.log("[GameContainer] Attempting login via useAuth.login()...");
        try {
            const loginSuccess = await loginAuthHook();
            if (loginSuccess) {
                logger.log("[GameContainer] Login successful. Admin/resource loading check will follow.");
                setHasUserInteracted(true); // User interaction point
                soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
                setIsSoundPlaying(true); // Button turns blue
                toast({ title: "Login Successful", description: "Welcome to Boby World!", duration: 3000 });
            } else {
                logger.warn("[GameContainer] loginAuthHook returned false without throwing an error. This is unexpected.");
                toast({ title: "Login Failed", description: "An unexpected issue occurred during login.", variant: "destructive" });
            }
        } catch (error: unknown) {
            logger.error(`[GameContainer] Login attempt failed: ${(error instanceof Error) ? error.message : 'Unknown error'}`);
            toast({
                title: "Login Failed",
                description: (error instanceof Error) ? error.message : "Could not authenticate with the server. Check logs for details.",
                variant: "destructive"
            });
        } finally {
            setIsRequestingNonce(false);
        }
    }, [loginAuthHook, toast, captchaVerified, isRequestingNonce, setHasUserInteracted, soundManagerRef]);

    const handleDisconnect = useCallback(async () => {
        toast({ title: "Disconnecting...", description: "Attempting to end your session." });
        try {
            logger.log("[GameContainer] Attempting logoutAuthSession (clears global auth state & local)...");
            await logoutAuthSessionHook();
            logger.log("[GameContainer] logoutAuthSession completed.");

            logger.log("[GameContainer] Attempting disconnectWalletAdapter (disconnects wallet from site)...");
            await disconnectWalletAdapterSession();
            logger.log("[GameContainer] disconnectWalletAdapter completed.");

            setCaptchaVerified(false);
            // setIsLoadingGameResources(false); // This is now managed by the asset loader hook
            setIsRedirectingToAdmin(false);
            setIsRequestingNonce(false);
            setHasUserInteracted(false); // Reset user interaction state on disconnect
            setShowEnableSoundButton(false); // Reset sound button state
            setIsSoundPlaying(false); // Reset sound playing state on disconnect


            toast({ title: "Disconnected", description: "Session ended. Please re-verify CAPTCHA to connect again.", duration: 3000 });
        } catch (error: unknown) {
            logger.error("[GameContainer] Error during full disconnect process:", error);
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
            logger.log("[GameContainer] AuthContext is loading, deferring admin/game resource decisions.");
            return;
        }

        logger.log(`[GameContainer] Auth state updated. IsAuth: ${isAuthenticated}, UserPK: ${authUser?.publicKey}, WalletConnectedAndMatching: ${isWalletConnectedAndMatching}, AdminPK: ${ADMIN_WALLET_ADDRESS}, Current Path: ${pathname}`);

        if (isAuthenticated && authUser?.publicKey) {
            if (authUser.publicKey === ADMIN_WALLET_ADDRESS) {
                if (!isRedirectingToAdmin && pathname !== '/admin') {
                    logger.log("[GameContainer] Admin user detected. Redirecting to /admin.");
                    setIsRedirectingToAdmin(true);
                    router.push('/admin');
                }
            } else {
                logger.log("[GameContainer] Authenticated as regular user. State will be managed by selectedGameMode effect.");
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
        logger.log(`[GameContainer] Game mode selected: ${mode}`);

        // Pre-emptively set loading state for ANY game mode to prevent "black flash"
        // between menu and game world loader.
        if (mode === 'boby-world' || mode === 'running-game') {
            setIsGameUILoading(true);
            setGameUILoadProgress(0);
        }

        setSelectedGameMode(mode);
        setHasUserInteracted(true); // User interaction point
        soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
        setIsSoundPlaying(true); // When game mode is selected, sound starts automatically
    }, [setHasUserInteracted, soundManagerRef]);

    // Callbacks to be passed down to the game component
    const handleLoadStart = useCallback(() => {
        logger.log("[GameContainer] Received load start signal from child.");
        setIsLoadingGameResources(true);
        setLoadProgress(0);
    }, []);

    const handleLoadProgress = useCallback((progress: number, phase?: string, currentAsset?: string, loadedAssets?: number, totalAssets?: number) => {
        // logger.log(`[GameContainer] Received progress update: ${progress}%`);
        setLoadProgress(progress);
        if (phase) {
            setLoadPhase(phase);
        }
        setCurrentAsset(currentAsset);
        setLoadedAssetsCount(loadedAssets);
        setTotalAssetsCount(totalAssets);
    }, []);

    const handleLoadComplete = useCallback((success: boolean) => {
        logger.log(`[GameContainer] Received load complete signal. Success: ${success}`);
        if (success) {
            setLoadProgress(100);
            // A small delay to show 100% before hiding the screen
            setTimeout(() => {
                setIsLoadingGameResources(false);
                // After loading completes - change screen for game sound
                setCurrentScreen(selectedGameMode as 'boby-world' | 'running-game');
            }, 500);
        } else {
            setAssetLoadError("Failed to load game assets. Please try refreshing the page.");
            setIsLoadingGameResources(false); // Stop loading on failure
        }
    }, [selectedGameMode, setCurrentScreen]);

    useEffect(() => {
        if (isAuthenticated && authUser && !isWalletConnectedAndMatching) {
            logger.warn("[GameContainer] Authenticated session detected with a mismatched or disconnected wallet. Forcing logout and redirect.");
            logoutAndRedirect('/');
        }
    }, [isAuthenticated, authUser, isWalletConnectedAndMatching, logoutAndRedirect]);

    // This useEffect now primarily sets hasUserInteracted on any initial click/keydown
    useEffect(() => {
        const handleInitialInteraction = () => {
            setHasUserInteracted(true);
            setIsSoundPlaying(true); // On first interaction, change button shape automatically
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

    // Callback to handle sheets state changes from GameUI
    const handleSheetsStateChange = useCallback((isAnySheetOpen: boolean) => {
        setAreSheetsOpen(isAnySheetOpen);
    }, []);

    // Use AuthContext's isLoading (isLoadingAuth) directly for session checking status
    // Eliminating local state to prevent flicker

    // Determine the current screen for SoundManager and update context
    useEffect(() => {
        let screen: 'captcha' | 'authentication' | 'mainMenu' | 'boby-world' | 'running-game' | 'loading' | 'admin';
        if (isLoadingAuth) {
            logger.log("[GameContainer] Displaying: Checking session...");
            screen = 'loading';
        } else if (!captchaVerified) {
            logger.log("[GameContainer] Displaying: Awaiting captcha verification (Deferred to Parent).");
            screen = 'captcha';
        } else if (!isAuthenticated) {
            logger.log("[GameContainer] Displaying: Not authenticated. Showing AuthenticationScreen.");
            screen = 'authentication';
        } else if (authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
            screen = 'admin';
        } else if (selectedGameMode === 'none') {
            screen = 'mainMenu';
        } else if (selectedGameMode === 'boby-world') {
            // During loading - keep menu sound
            screen = 'mainMenu';
        } else if (selectedGameMode === 'running-game') {
            // During loading - keep menu sound
            screen = 'mainMenu';
        } else {
            screen = 'mainMenu';
        }
        setCurrentScreen(screen);
    }, [isLoadingAuth, captchaVerified, isAuthenticated, authUser, selectedGameMode, isLoadingGameResources, setCurrentScreen]);


    // Main content rendering logic
    let mainContent;
    if (isLoadingAuth) {
        logger.log("[GameContainer] Displaying: Checking session...");
        mainContent = <LoadingScreen message="" showLogo variant='indeterminate' />;
    } else if (!captchaVerified && !isAuthenticated) {
        logger.log("[GameContainer] Displaying: Awaiting captcha verification (Deferred to Parent).");
        mainContent = <LoadingScreen message="Verification required..." showLogo variant='indeterminate' />;
    } else if (!isAuthenticated) {
        logger.log("[GameContainer] Displaying: Not authenticated. Showing AuthenticationScreen.");
        mainContent = <AuthenticationScreen onRequestDisconnect={handleDisconnect} onLoginAttempt={handleLoginAttempt} captchaVerified={captchaVerified} />;
    } else if (authUser?.publicKey === ADMIN_WALLET_ADDRESS) {
        if (!isRedirectingToAdmin) {
            logger.log("[GameContainer] Admin user authenticated, initiating redirect.");
            mainContent = <LoadingScreen message="Redirecting to admin panel..." showLogo variant='indeterminate' />;
        } else {
            logger.log("[GameContainer] Displaying: Redirecting to admin panel...");
            mainContent = <LoadingScreen message="Redirecting to admin panel..." showLogo variant='indeterminate' />;
        }
    } else if (selectedGameMode === 'none') {
        // Show Initial Asset Loader only once before showing GameMainMenu
        if (isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isRedirectingToAdmin && !assetPreloadComplete) {
            logger.log("[GameContainer] Displaying: Authenticated. Showing InitialAssetLoader before GameMainMenu.");
            mainContent = (
                <InitialAssetLoader
                    onComplete={() => {
                        logger.log("[GameContainer] Initial asset preload completed, showing GameMainMenu.");
                        // Update state to show GameMainMenu instead of reloading
                        setAssetPreloadComplete(true);
                    }}
                    onError={(error) => {
                        logger.error("[GameContainer] Initial asset preload failed:", error);
                        // Still show GameMainMenu but with error indication
                        toast({
                            title: "Resource Loading Failed",
                            description: "The menu will be displayed but some resources may not work properly",
                            variant: "destructive"
                        });
                        // Mark as complete even on error to show menu
                        setAssetPreloadComplete(true);
                    }}
                />
            );
        } else if (isAuthenticated && authUser?.publicKey !== ADMIN_WALLET_ADDRESS && !isRedirectingToAdmin && selectedGameMode === 'none') {
            // Show GameMainMenu after preload is complete
            logger.log("[GameContainer] Displaying: Authenticated. Showing GameMainMenu for mode selection.");
            mainContent = <GameMainMenu onGameModeSelected={handleGameModeSelected} />;
        }
    } else if (isGameUIVisible()) {
        // Render the game UI with loading overlay
        if (selectedGameMode === 'boby-world') {
            logger.log("[GameContainer] Displaying: Boby World GameUI for regular user.");
            mainContent = (
                <>
                    {isGameUILoading && (
                        <GameLoadingOverlay
                            isLoading={true}
                            progress={gameUILoadProgress}
                            error={null}
                            phase="Loading game world..."
                            showTips={true}
                        />
                    )}
                    <GameUI
                        octreeRef={octreeRef}
                        onSheetsStateChange={handleSheetsStateChange}
                        onLoadStart={() => {
                            logger.log('[GameContainer] GameUI loading started');
                            setIsGameUILoading(true);
                            setGameUILoadProgress(0);
                        }}
                        onLoadProgress={(progress) => {
                            logger.log(`[GameContainer] GameUI loading progress: ${progress}%`);
                            setGameUILoadProgress(progress);
                        }}
                        onLoadComplete={(success) => {
                            logger.log(`[GameContainer] GameUI loading complete: ${success}`);
                            setIsGameUILoading(false);
                            if (!success) {
                                toast({
                                    title: 'Loading Error',
                                    description: 'Failed to load game world',
                                    variant: 'destructive'
                                });
                            }
                        }}
                    />
                </>
            );
        } else if (selectedGameMode === 'running-game') {
            logger.log("[GameContainer] Displaying: Running Game UI for regular user.");
            mainContent = (
                <>
                    {isGameUILoading && (
                        <GameLoadingOverlay
                            isLoading={true}
                            progress={0} // Placeholder doesn't really have progress
                            error={null}
                            phase="Preparing running game..."
                            showTips={false}
                        />
                    )}
                    <RunningGameUI
                        onLoadComplete={(success) => {
                            logger.log(`[GameContainer] RunningGameUI loading complete: ${success}`);
                            setIsGameUILoading(false);
                        }}
                    />
                </>
            );
        }
    } else {
        // Fallback if no other condition is met. This might happen briefly during state transitions.
        logger.log("[GameContainer] Fallback: No specific content to render, showing loading screen.");
        mainContent = <LoadingScreen message="Finalizing setup..." showLogo />;
    }

    return (
        <>
            {/* Sound Control Button - Responsive - Hidden when windows are open */}
            {!areSheetsOpen && (
                <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1000 }} className="sm:top-6 sm:right-6 md:top-8 md:right-8">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                            if (!isSoundPlaying) {
                                // Start playing for first time
                                soundManagerRef.current?.playCurrentTrack();
                                setIsSoundPlaying(true); // ✅ Change button state
                                setHasUserInteracted(true);
                            } else {
                                // Toggle mute
                                toggleMute();
                            }
                        }}

                        aria-label={!isSoundPlaying ? "Enable Sound" : (isMuted ? "Unmute" : "Mute")}
                    >
                        {!isSoundPlaying ? (
                            <VolumeX className="h-4 w-4" />
                        ) : isMuted ? (
                            <VolumeX className="h-4 w-4 text-gray-500" />
                        ) : (
                            <Volume2 className="h-4 w-4 text-green-500" />
                        )}
                    </Button>
                </div>
            )}
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
