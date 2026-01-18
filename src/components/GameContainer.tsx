'use client';

import { EnableSoundButton, MainContentRenderer, SoundControlButton } from '@/components/game-bootstrap/GameContainerViews';
import { useAudio } from '@/contexts/AudioContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useGameContainerHandlers, useGameContainerState } from '@/hooks/useGameContainer';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

export interface GameContainerProps { captchaVerified: boolean; }

// --- Auth Sync Effect ---
const useAuthSyncEffect = (isAuthenticated: boolean, captchaVerified: boolean, setCaptchaVerified: (v: boolean) => void) => {
    useEffect(() => { if (isAuthenticated && !captchaVerified) setCaptchaVerified(true); }, [isAuthenticated, captchaVerified, setCaptchaVerified]);
};

// --- Admin Redirect Effect ---
interface AdminRedirectProps {
    isLoadingAuth: boolean; isAuthenticated: boolean; isAdmin: boolean; pathname: string;
    isRedirectingToAdmin: boolean; setIsRedirectingToAdmin: (v: boolean) => void;
    setSelectedGameMode: (v: 'none' | 'boby-world' | 'running-game') => void; router: ReturnType<typeof useRouter>;
}
const useAdminRedirectEffect = (props: AdminRedirectProps) => {
    const { isLoadingAuth, isAuthenticated, isAdmin, pathname, isRedirectingToAdmin, setIsRedirectingToAdmin, setSelectedGameMode, router } = props;
    useEffect(() => {
        if (isLoadingAuth) return;
        if (isAuthenticated && isAdmin && !isRedirectingToAdmin && pathname !== '/admin') {
            logger.log("[GC] Admin. Redirecting."); setIsRedirectingToAdmin(true); router.push('/admin');
        } else if (!isAuthenticated) {
            if (isRedirectingToAdmin) setIsRedirectingToAdmin(false); setSelectedGameMode('none');
        }
    }, [isAuthenticated, isAdmin, isLoadingAuth, pathname, isRedirectingToAdmin, setIsRedirectingToAdmin, setSelectedGameMode, router]);
};

// --- Wallet Mismatch Effect ---
const useWalletMismatchEffect = (isAuthenticated: boolean, authUserPublicKey: string | undefined, isWalletConnectedAndMatching: boolean, logoutAndRedirect: (path: string) => void) => {
    useEffect(() => {
        if (isAuthenticated && authUserPublicKey && !isWalletConnectedAndMatching) { logger.warn("[GC] Wallet mismatch."); logoutAndRedirect('/'); }
    }, [isAuthenticated, authUserPublicKey, isWalletConnectedAndMatching, logoutAndRedirect]);
};

// --- User Interaction Effect ---
const useUserInteractionEffect = (setHasUserInteracted: (v: boolean) => void, setIsSoundPlaying: (v: boolean) => void) => {
    useEffect(() => {
        const h = () => { setHasUserInteracted(true); setIsSoundPlaying(true); window.removeEventListener('click', h); window.removeEventListener('keydown', h); };
        window.addEventListener('click', h); window.addEventListener('keydown', h);
        return () => { window.removeEventListener('click', h); window.removeEventListener('keydown', h); };
    }, [setHasUserInteracted, setIsSoundPlaying]);
};

// --- Screen Context Effect ---
interface ScreenContextProps {
    isLoadingAuth: boolean; captchaVerified: boolean; isAuthenticated: boolean; isAdmin: boolean;
    setCurrentScreen: (s: 'captcha' | 'authentication' | 'mainMenu' | 'loading' | 'admin') => void;
}
const useScreenContextEffect = (props: ScreenContextProps) => {
    const { isLoadingAuth, captchaVerified, isAuthenticated, isAdmin, setCurrentScreen } = props;
    useEffect(() => {
        let s: 'captcha' | 'authentication' | 'mainMenu' | 'loading' | 'admin' = 'mainMenu';
        if (isLoadingAuth) s = 'loading'; else if (!captchaVerified) s = 'captcha'; else if (!isAuthenticated) s = 'authentication'; else if (isAdmin) s = 'admin';
        setCurrentScreen(s);
    }, [isLoadingAuth, captchaVerified, isAuthenticated, isAdmin, setCurrentScreen]);
};

// --- Main Component ---
const GameContainer: React.FC<GameContainerProps> = ({ captchaVerified: initialCaptchaVerified }) => {
    const auth = useAuth();
    const sessionWallet = useSessionWallet();
    const { toast } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const audio = useAudio();
    const state = useGameContainerState(initialCaptchaVerified);
    const handlers = useGameContainerHandlers({ state, auth, sessionWallet, audio, toast });

    const { isAuthenticated, user: authUser, isLoading: isLoadingAuth, logoutAndRedirect, isWalletConnectedAndMatching } = auth;
    const { soundManagerRef, isMuted, toggleMute, setHasUserInteracted, setCurrentScreen } = audio;
    const isAdmin = authUser?.publicKey === ADMIN_WALLET_ADDRESS;

    // Apply all effects
    useAuthSyncEffect(isAuthenticated, state.captchaVerified, state.setCaptchaVerified);
    useAdminRedirectEffect({ isLoadingAuth, isAuthenticated, isAdmin, pathname, isRedirectingToAdmin: state.isRedirectingToAdmin, setIsRedirectingToAdmin: state.setIsRedirectingToAdmin, setSelectedGameMode: state.setSelectedGameMode, router });
    useWalletMismatchEffect(isAuthenticated, authUser?.publicKey, isWalletConnectedAndMatching, logoutAndRedirect);
    useUserInteractionEffect(setHasUserInteracted, state.setIsSoundPlaying);
    useScreenContextEffect({ isLoadingAuth, captchaVerified: state.captchaVerified, isAuthenticated, isAdmin, setCurrentScreen });

    // Callbacks - fully destructured to satisfy exhaustive-deps
    const { isSoundPlaying, setIsSoundPlaying, setAssetPreloadComplete, setIsGameUILoading, setGameUILoadProgress, showEnableSoundButton, areSheetsOpen, selectedGameMode, assetPreloadComplete, isGameUILoading, gameUILoadProgress, octreeRef, captchaVerified } = state;

    const handleSoundToggle = useCallback(() => {
        if (!isSoundPlaying) { soundManagerRef.current?.playCurrentTrack(); setIsSoundPlaying(true); setHasUserInteracted(true); }
        else { toggleMute(); }
    }, [isSoundPlaying, soundManagerRef, toggleMute, setHasUserInteracted, setIsSoundPlaying]);

    const onAssetPreloadComplete = useCallback(() => { logger.log("[GC] Preload done."); setAssetPreloadComplete(true); }, [setAssetPreloadComplete]);
    const onAssetPreloadError = useCallback((e: string) => { logger.error("[GC] Preload error:", e); toast({ title: "Load Failed", variant: "destructive" }); setAssetPreloadComplete(true); }, [toast, setAssetPreloadComplete]);
    const onGameUILoadStart = useCallback(() => { setIsGameUILoading(true); setGameUILoadProgress(0); }, [setIsGameUILoading, setGameUILoadProgress]);
    const onGameUILoadProgress = useCallback((prog: number) => { setGameUILoadProgress(prog); }, [setGameUILoadProgress]);
    const onGameUILoadComplete = useCallback((success: boolean) => { setIsGameUILoading(false); if (!success) toast({ title: 'Error', variant: 'destructive' }); }, [setIsGameUILoading, toast]);

    return (
        <>
            <SoundControlButton areSheetsOpen={areSheetsOpen} isSoundPlaying={isSoundPlaying} isMuted={isMuted} onToggle={handleSoundToggle} />
            <EnableSoundButton show={showEnableSoundButton} onClick={handlers.handleEnableSoundClick} />
            <MainContentRenderer isLoadingAuth={isLoadingAuth} captchaVerified={captchaVerified} isAuthenticated={isAuthenticated} isAdminUser={isAdmin} selectedGameMode={selectedGameMode} assetPreloadComplete={assetPreloadComplete} isGameUIVisible={handlers.isGameUIVisible()} isGameUILoading={isGameUILoading} gameUILoadProgress={gameUILoadProgress} octreeRef={octreeRef} onDisconnect={handlers.handleDisconnect} onLoginAttempt={handlers.handleLoginAttempt} onGameModeSelected={handlers.handleGameModeSelected} onSheetsStateChange={handlers.handleSheetsStateChange} onAssetPreloadComplete={onAssetPreloadComplete} onAssetPreloadError={onAssetPreloadError} onGameUILoadStart={onGameUILoadStart} onGameUILoadProgress={onGameUILoadProgress} onGameUILoadComplete={onGameUILoadComplete} />
        </>
    );
};

export default GameContainer;
