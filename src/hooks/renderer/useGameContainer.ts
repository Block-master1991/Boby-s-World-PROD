"use client";

import type { useAudio } from "@/contexts/AudioContext";
import type { useAuth } from "@/hooks/auth/useAuth";
import type { useSessionWallet } from "@/hooks/auth/useSessionWallet";
import type { useToast } from "@/hooks/ui/use-toast";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface GameContainerState {
  captchaVerified: boolean;
  setCaptchaVerified: (v: boolean) => void;
  isRequestingNonce: boolean;
  setIsRequestingNonce: (v: boolean) => void;
  isRedirectingToAdmin: boolean;
  setIsRedirectingToAdmin: (v: boolean) => void;
  selectedGameMode: "none" | "boby-world" | "running-game";
  setSelectedGameMode: (v: "none" | "boby-world" | "running-game") => void;
  showEnableSoundButton: boolean;
  setShowEnableSoundButton: (v: boolean) => void;
  isSoundPlaying: boolean;
  setIsSoundPlaying: (v: boolean) => void;
  assetPreloadComplete: boolean;
  setAssetPreloadComplete: (v: boolean) => void;
  areSheetsOpen: boolean;
  setAreSheetsOpen: (v: boolean) => void;
  isGameUILoading: boolean;
  setIsGameUILoading: (v: boolean) => void;
  gameUILoadProgress: number;
  setGameUILoadProgress: (v: number) => void;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
}

export const useGameContainerState = (initialCaptchaVerified: boolean): GameContainerState => {
  const [captchaVerified, setCaptchaVerified] = useState(initialCaptchaVerified);
  const [isRequestingNonce, setIsRequestingNonce] = useState(false);
  const [isRedirectingToAdmin, setIsRedirectingToAdmin] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState<"none" | "boby-world" | "running-game">(
    "none"
  );
  const [showEnableSoundButton, setShowEnableSoundButton] = useState(false);
  const [isSoundPlaying, setIsSoundPlaying] = useState(false);
  const [assetPreloadComplete, setAssetPreloadComplete] = useState(false);
  const [areSheetsOpen, setAreSheetsOpen] = useState(false);
  const [isGameUILoading, setIsGameUILoading] = useState(false);
  const [gameUILoadProgress, setGameUILoadProgress] = useState(0);
  const octreeRef = useRef<Octree<GameObject> | null>(null);

  useEffect(() => {
    setCaptchaVerified(initialCaptchaVerified);
  }, [initialCaptchaVerified]);

  return {
    captchaVerified,
    setCaptchaVerified,
    isRequestingNonce,
    setIsRequestingNonce,
    isRedirectingToAdmin,
    setIsRedirectingToAdmin,
    selectedGameMode,
    setSelectedGameMode,
    showEnableSoundButton,
    setShowEnableSoundButton,
    isSoundPlaying,
    setIsSoundPlaying,
    assetPreloadComplete,
    setAssetPreloadComplete,
    areSheetsOpen,
    setAreSheetsOpen,
    isGameUILoading,
    setIsGameUILoading,
    gameUILoadProgress,
    setGameUILoadProgress,
    octreeRef,
  };
};

// --- Login Handler Hook ---
interface UseLoginHandlerProps {
  captchaVerified: boolean;
  isRequestingNonce: boolean;
  setIsRequestingNonce: (v: boolean) => void;
  setIsSoundPlaying: (v: boolean) => void;
  loginAuthHook: () => Promise<boolean>;
  toast: ReturnType<typeof useToast>["toast"];
  setHasUserInteracted: (v: boolean) => void;
  soundManagerRef: MutableRefObject<{ playCurrentTrack: () => void } | null>;
}

export const useLoginHandler = (p: UseLoginHandlerProps) => {
  return useCallback(async () => {
    if (!p.captchaVerified || p.isRequestingNonce) return;
    p.setIsRequestingNonce(true);
    try {
      const success = await p.loginAuthHook();
      if (success) {
        p.setHasUserInteracted(true);
        p.soundManagerRef.current?.playCurrentTrack();
        p.setIsSoundPlaying(true);
        p.toast({ title: "Login Successful", duration: 3000 });
      } else {
        p.toast({ title: "Login Failed", variant: "destructive" });
      }
    } catch (e: unknown) {
      logger.error(`Login failed: ${e instanceof Error ? e.message : "Unknown"}`);
      p.toast({ title: "Login Failed", variant: "destructive" });
    } finally {
      p.setIsRequestingNonce(false);
    }
  }, [
    p.captchaVerified,
    p.isRequestingNonce,
    p.loginAuthHook,
    p.toast,
    p.setHasUserInteracted,
    p.soundManagerRef,
    p.setIsRequestingNonce,
    p.setIsSoundPlaying,
  ]);
};

// --- Disconnect Handler Hook ---
interface UseDisconnectHandlerProps {
  logoutAuthSessionHook: () => Promise<void>;
  disconnectWalletAdapterSession: () => Promise<void>;
  setCaptchaVerified: (v: boolean) => void;
  setIsRedirectingToAdmin: (v: boolean) => void;
  setIsRequestingNonce: (v: boolean) => void;
  setHasUserInteracted: (v: boolean) => void;
  setShowEnableSoundButton: (v: boolean) => void;
  setIsSoundPlaying: (v: boolean) => void;
  toast: ReturnType<typeof useToast>["toast"];
}

export const useDisconnectHandler = (p: UseDisconnectHandlerProps) => {
  return useCallback(async () => {
    p.toast({ title: "Disconnecting..." });
    try {
      await p.logoutAuthSessionHook();
      await p.disconnectWalletAdapterSession();
      p.setCaptchaVerified(false);
      p.setIsRedirectingToAdmin(false);
      p.setIsRequestingNonce(false);
      p.setHasUserInteracted(false);
      p.setShowEnableSoundButton(false);
      p.setIsSoundPlaying(false);
      p.toast({ title: "Disconnected", duration: 3000 });
    } catch (e: unknown) {
      logger.error("Disconnect error:", e);
      p.toast({ title: "Error", variant: "destructive" });
    }
  }, [
    p.logoutAuthSessionHook,
    p.disconnectWalletAdapterSession,
    p.toast,
    p.setHasUserInteracted,
    p.setCaptchaVerified,
    p.setIsRedirectingToAdmin,
    p.setIsRequestingNonce,
    p.setShowEnableSoundButton,
    p.setIsSoundPlaying,
  ]);
};

// --- Game Mode Handler Hook ---
interface UseGameModeHandlerProps {
  setIsGameUILoading: (v: boolean) => void;
  setGameUILoadProgress: (v: number) => void;
  setSelectedGameMode: (v: "none" | "boby-world" | "running-game") => void;
  setHasUserInteracted: (v: boolean) => void;
  setIsSoundPlaying: (v: boolean) => void;
  soundManagerRef: MutableRefObject<{ playCurrentTrack: () => void } | null>;
}

export const useGameModeHandler = (p: UseGameModeHandlerProps) => {
  return useCallback(
    (mode: "boby-world" | "running-game") => {
      logger.log(`Mode: ${mode}`);
      p.setIsGameUILoading(true);
      p.setGameUILoadProgress(0);
      p.setSelectedGameMode(mode);
      p.setHasUserInteracted(true);
      p.soundManagerRef.current?.playCurrentTrack();
      p.setIsSoundPlaying(true);
    },
    [
      p.setHasUserInteracted,
      p.soundManagerRef,
      p.setIsGameUILoading,
      p.setGameUILoadProgress,
      p.setSelectedGameMode,
      p.setIsSoundPlaying,
    ]
  );
};

// --- Utility Handlers Hook ---
interface UseUtilityHandlersProps {
  soundManagerRef: MutableRefObject<{ playCurrentTrack: () => void } | null>;
  setShowEnableSoundButton: (v: boolean) => void;
  setAreSheetsOpen: (v: boolean) => void;
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  isRedirectingToAdmin: boolean;
  selectedGameMode: "none" | "boby-world" | "running-game";
}

export const useUtilityHandlers = (p: UseUtilityHandlersProps) => {
  const handleEnableSoundClick = useCallback(() => {
    p.soundManagerRef.current?.playCurrentTrack();
    p.setShowEnableSoundButton(false);
  }, [p.soundManagerRef, p.setShowEnableSoundButton]);
  const handleSheetsStateChange = useCallback(
    (isOpen: boolean) => {
      p.setAreSheetsOpen(isOpen);
    },
    [p.setAreSheetsOpen]
  );
  const isGameUIVisible = useCallback(
    () =>
      p.isAuthenticated &&
      !!p.authUserPublicKey &&
      !p.isRedirectingToAdmin &&
      p.selectedGameMode !== "none",
    [p.isAuthenticated, p.authUserPublicKey, p.isRedirectingToAdmin, p.selectedGameMode]
  );
  return { handleEnableSoundClick, handleSheetsStateChange, isGameUIVisible };
};

// --- Combined Handlers Hook (Facade) ---
interface UseGameContainerHandlersProps {
  state: GameContainerState;
  auth: ReturnType<typeof useAuth>;
  sessionWallet: ReturnType<typeof useSessionWallet>;
  audio: ReturnType<typeof useAudio>;
  toast: ReturnType<typeof useToast>["toast"];
}

export interface GameContainerHandlers {
  handleLoginAttempt: () => Promise<void>;
  handleDisconnect: () => Promise<void>;
  handleGameModeSelected: (mode: "boby-world" | "running-game") => void;
  handleEnableSoundClick: () => void;
  handleSheetsStateChange: (isAnySheetOpen: boolean) => void;
  isGameUIVisible: () => boolean;
}

export const useGameContainerHandlers = (
  props: UseGameContainerHandlersProps
): GameContainerHandlers => {
  const { state, auth, sessionWallet, audio, toast } = props;
  const {
    login: loginAuthHook,
    logout: logoutAuthSessionHook,
    isAuthenticated,
    user: authUser,
  } = auth;
  const { disconnectFromSession: disconnectWalletAdapterSession } = sessionWallet;
  const { soundManagerRef, setHasUserInteracted } = audio;

  const handleLoginAttempt = useLoginHandler({
    captchaVerified: state.captchaVerified,
    isRequestingNonce: state.isRequestingNonce,
    setIsRequestingNonce: state.setIsRequestingNonce,
    setIsSoundPlaying: state.setIsSoundPlaying,
    loginAuthHook,
    toast,
    setHasUserInteracted,
    soundManagerRef,
  });

  const handleDisconnect = useDisconnectHandler({
    logoutAuthSessionHook,
    disconnectWalletAdapterSession,
    toast,
    setHasUserInteracted,
    setCaptchaVerified: state.setCaptchaVerified,
    setIsRedirectingToAdmin: state.setIsRedirectingToAdmin,
    setIsRequestingNonce: state.setIsRequestingNonce,
    setShowEnableSoundButton: state.setShowEnableSoundButton,
    setIsSoundPlaying: state.setIsSoundPlaying,
  });

  const handleGameModeSelected = useGameModeHandler({
    setIsGameUILoading: state.setIsGameUILoading,
    setGameUILoadProgress: state.setGameUILoadProgress,
    setSelectedGameMode: state.setSelectedGameMode,
    setHasUserInteracted,
    setIsSoundPlaying: state.setIsSoundPlaying,
    soundManagerRef,
  });

  const { handleEnableSoundClick, handleSheetsStateChange, isGameUIVisible } = useUtilityHandlers({
    soundManagerRef,
    setShowEnableSoundButton: state.setShowEnableSoundButton,
    setAreSheetsOpen: state.setAreSheetsOpen,
    isAuthenticated,
    authUserPublicKey: authUser?.publicKey,
    isRedirectingToAdmin: state.isRedirectingToAdmin,
    selectedGameMode: state.selectedGameMode,
  });

  return {
    handleLoginAttempt,
    handleDisconnect,
    handleGameModeSelected,
    handleEnableSoundClick,
    handleSheetsStateChange,
    isGameUIVisible,
  };
};
