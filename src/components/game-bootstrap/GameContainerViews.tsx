"use client";

import { Button } from "@/components/ui/button";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { Volume2, VolumeX } from "lucide-react";
import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import React from "react";

// Lazy load components
const LoadingScreen = dynamic(() => import("@/components/game-bootstrap/LoadingScreen"), {
  ssr: false,
});
const GameUI = dynamic(() => import("@/components/game/GameUI"), { ssr: false });
const InitialAssetLoader = dynamic(() => import("@/components/InitialAssetLoader"), { ssr: false });
const GameMainMenu = dynamic(() => import("@/components/game/GameMainMenu"), { ssr: false });
const RunningGameUI = dynamic(() => import("@/components/game/RunningGameUI"), { ssr: false });
const AuthenticationScreen = dynamic(
  () => import("@/components/game-bootstrap/AuthenticationScreen"),
  { ssr: false }
);
const CaptchaScreen = dynamic(() => import("@/components/game-bootstrap/CaptchaScreen"), {
  ssr: false,
});
const GameLoadingOverlay = dynamic(() => import("@/components/game-bootstrap/GameLoadingOverlay"), {
  ssr: false,
});

// --- Sound Control Button ---
interface SoundControlButtonProps {
  areSheetsOpen: boolean;
  isSoundPlaying: boolean;
  isMuted: boolean;
  onToggle: () => void;
}

export const SoundControlButton: React.FC<SoundControlButtonProps> = ({
  areSheetsOpen,
  isSoundPlaying,
  isMuted,
  onToggle,
}) => {
  if (areSheetsOpen) return null;
  return (
    <div
      style={{ position: "fixed", top: "20px", right: "20px", zIndex: 1000 }}
      className="sm:top-6 sm:right-6 md:top-8 md:right-8"
    >
      <Button
        variant="outline"
        size="icon"
        onClick={onToggle}
        aria-label={!isSoundPlaying ? "Enable Sound" : isMuted ? "Unmute" : "Mute"}
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
  );
};

// --- Enable Sound Fallback Button ---
interface EnableSoundButtonProps {
  show: boolean;
  onClick: () => void;
}

export const EnableSoundButton: React.FC<EnableSoundButtonProps> = ({ show, onClick }) => {
  if (!show) return null;
  return (
    <div style={{ position: "fixed", bottom: "80px", right: "20px", zIndex: 1000 }}>
      <Button onClick={onClick}>Enable Sound</Button>
    </div>
  );
};

// --- Sub-renderers for MainContentRenderer ---

interface AuthContentProps {
  isLoadingAuth: boolean;
  captchaVerified: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  onDisconnect: () => Promise<void>;
  onLoginAttempt: () => Promise<void>;
  siteKey: string;
  onCaptchaSuccess: () => void;
}

const AuthContent: React.FC<AuthContentProps> = ({
  isLoadingAuth,
  captchaVerified,
  isAuthenticated,
  isLocked,
  onDisconnect,
  onLoginAttempt,
  siteKey,
  onCaptchaSuccess,
}) => {
  if (isLoadingAuth) return <LoadingScreen message="" showLogo variant="indeterminate" />;
  if (!captchaVerified && !isAuthenticated) {
    return <CaptchaScreen siteKey={siteKey} onVerificationSuccess={onCaptchaSuccess} />;
  }
  // If not authenticated OR session is locked, show the authentication/lock screen
  if (!isAuthenticated || isLocked) {
    return (
      <AuthenticationScreen
        onRequestDisconnect={onDisconnect}
        onLoginAttempt={onLoginAttempt}
        captchaVerified={captchaVerified}
        isLocked={isLocked}
      />
    );
  }
  return null;
};

interface GameModeContentProps {
  selectedGameMode: "none" | "boby-world" | "running-game";
  assetPreloadComplete: boolean;
  onGameModeSelected: (mode: "boby-world" | "running-game") => void;
  onAssetPreloadComplete: () => void;
  onAssetPreloadError: (error: string) => void;
}

const GameModeContent: React.FC<GameModeContentProps> = ({
  selectedGameMode,
  assetPreloadComplete,
  onGameModeSelected,
  onAssetPreloadComplete,
  onAssetPreloadError,
}) => {
  if (selectedGameMode !== "none") return null;
  if (!assetPreloadComplete)
    return <InitialAssetLoader onComplete={onAssetPreloadComplete} onError={onAssetPreloadError} />;
  return <GameMainMenu onGameModeSelected={onGameModeSelected} />;
};

interface GameUIContentProps {
  selectedGameMode: "boby-world" | "running-game";
  isGameUILoading: boolean;
  gameUILoadProgress: number;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  onSheetsStateChange: (isOpen: boolean) => void;
  onGameUILoadStart: () => void;
  onGameUILoadProgress: (progress: number) => void;
  onGameUILoadComplete: (success: boolean) => void;
}

const GameUIContent: React.FC<GameUIContentProps> = props => {
  const {
    selectedGameMode,
    isGameUILoading,
    gameUILoadProgress,
    octreeRef,
    onSheetsStateChange,
    onGameUILoadStart,
    onGameUILoadProgress,
    onGameUILoadComplete,
  } = props;

  if (selectedGameMode === "boby-world") {
    return (
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
          onSheetsStateChange={onSheetsStateChange}
          onLoadStart={onGameUILoadStart}
          onLoadProgress={onGameUILoadProgress}
          onLoadComplete={onGameUILoadComplete}
        />
      </>
    );
  }
  return (
    <>
      {isGameUILoading && (
        <GameLoadingOverlay
          isLoading={true}
          progress={0}
          error={null}
          phase="Preparing running game..."
          showTips={false}
        />
      )}
      <RunningGameUI onLoadComplete={onGameUILoadComplete} />
    </>
  );
};

// --- Main Content Renderer ---
export interface MainContentRendererProps {
  isLoadingAuth: boolean;
  captchaVerified: boolean;
  isAuthenticated: boolean;
  isLocked: boolean;
  isAdminUser: boolean;
  selectedGameMode: "none" | "boby-world" | "running-game";
  assetPreloadComplete: boolean;
  isGameUIVisible: boolean;
  isGameUILoading: boolean;
  gameUILoadProgress: number;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  onDisconnect: () => Promise<void>;
  onLoginAttempt: () => Promise<void>;
  onGameModeSelected: (mode: "boby-world" | "running-game") => void;
  onSheetsStateChange: (isOpen: boolean) => void;
  onAssetPreloadComplete: () => void;
  onAssetPreloadError: (error: string) => void;
  onGameUILoadStart: () => void;
  onGameUILoadProgress: (progress: number) => void;
  onGameUILoadComplete: (success: boolean) => void;
  siteKey: string;
  onCaptchaSuccess: () => void;
}

export const MainContentRenderer: React.FC<MainContentRendererProps> = props => {
  const {
    isLoadingAuth,
    captchaVerified,
    isAuthenticated,
    isLocked,
    isAdminUser,
    selectedGameMode,
    assetPreloadComplete,
    isGameUIVisible,
    isGameUILoading,
    gameUILoadProgress,
    octreeRef,
    onDisconnect,
    onLoginAttempt,
    onGameModeSelected,
    onSheetsStateChange,
    onAssetPreloadComplete,
    onAssetPreloadError,
    onGameUILoadStart,
    onGameUILoadProgress,
    onGameUILoadComplete,
    siteKey,
    onCaptchaSuccess,
  } = props;

  // Auth states (including Lock screen)
  const authContent = (
    <AuthContent
      isLoadingAuth={isLoadingAuth}
      captchaVerified={captchaVerified}
      isAuthenticated={isAuthenticated}
      isLocked={isLocked}
      onDisconnect={onDisconnect}
      onLoginAttempt={onLoginAttempt}
      siteKey={siteKey}
      onCaptchaSuccess={onCaptchaSuccess}
    />
  );
  if (authContent.props && (isLoadingAuth || !isAuthenticated || isLocked)) return authContent;

  // Admin redirect
  if (isAdminUser)
    return (
      <LoadingScreen message="Redirecting to admin panel..." showLogo variant="indeterminate" />
    );

  // Game mode selection
  if (selectedGameMode === "none") {
    return (
      <GameModeContent
        selectedGameMode={selectedGameMode}
        assetPreloadComplete={assetPreloadComplete}
        onGameModeSelected={onGameModeSelected}
        onAssetPreloadComplete={onAssetPreloadComplete}
        onAssetPreloadError={onAssetPreloadError}
      />
    );
  }

  // Game UI
  if (
    isGameUIVisible &&
    (selectedGameMode === "boby-world" || selectedGameMode === "running-game")
  ) {
    return (
      <GameUIContent
        selectedGameMode={selectedGameMode}
        isGameUILoading={isGameUILoading}
        gameUILoadProgress={gameUILoadProgress}
        octreeRef={octreeRef}
        onSheetsStateChange={onSheetsStateChange}
        onGameUILoadStart={onGameUILoadStart}
        onGameUILoadProgress={onGameUILoadProgress}
        onGameUILoadComplete={onGameUILoadComplete}
      />
    );
  }

  return <LoadingScreen message="Finalizing setup..." showLogo />;
};

export { LoadingScreen };
