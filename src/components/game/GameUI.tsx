"use client";

import GameCanvas from "@/components/game/GameCanvas";
import GameOverlayUI from "@/components/game/ui/GameOverlayUI";
import { GameSheets } from "@/components/game/ui/GameSheets";
import { useGameController } from "@/hooks/game-ui/useGameController";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import React from "react";

interface GameUIProps {
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  onSheetsStateChange?: (isAnySheetOpen: boolean) => void;
  onLoadStart: () => void;
  onLoadProgress: (progress: number) => void;
  onLoadComplete: (success: boolean) => void;
  COIN_COUNT_FOR_GAME_LOGIC?: number;
}

const GameUI: React.FC<GameUIProps> = props => {
  const {
    sessionPublicKey,
    adapterPublicKey,
    isWalletMismatch,
    isAuthenticated,
    authUser,
    isWalletConnectedAndMatching,
    gameData,
    economy,
    inventory,
    effects,
    joystick,
    sheets,
    toggleSheet,
    isPaused,
    overlayProps,
  } = useGameController(props);

  return (
    <div className="relative flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-grow flex flex-col relative">
        <GameCanvas
          sessionPublicKey={sessionPublicKey}
          isSpeedBoostActive={effects.isSpeedBoostActive}
          isShieldActive={effects.isShieldActive}
          isCoinMagnetActive={effects.isCoinMagnetActive}
          COIN_MAGNET_RADIUS={8}
          onCoinCollected={economy.handleCoinCollected}
          onRemainingCoinsUpdate={economy.handleRemainingCoinsUpdate}
          isPaused={isPaused}
          joystickInput={joystick.joystickMovement}
          onCanvasTouchStart={joystick.handleCanvasTouchStart}
          onCanvasTouchMove={joystick.handleCanvasTouchMove}
          onCanvasTouchEnd={joystick.handleCanvasTouchEnd}
          protectionBottleCount={inventory.displayedProtectionBottleCount}
          onConsumeProtectionBottle={inventory.handleConsumeProtectionBottle}
          onEnemyCollisionPenalty={economy.handleEnemyCollisionPenalty}
          COIN_COUNT={economy.COIN_COUNT_FOR_GAME_LOGIC}
          octreeRef={props.octreeRef}
          onLoadStart={props.onLoadStart}
          onLoadProgress={props.onLoadProgress}
          onLoadComplete={props.onLoadComplete}
        />

        <GameOverlayUI {...overlayProps} />

        <GameSheets
          sheets={sheets}
          toggleSheet={toggleSheet}
          isPaused={isPaused}
          isWalletMismatch={isWalletMismatch}
          isAuthenticated={isAuthenticated}
          authUserPublicKey={authUser?.publicKey}
          sessionPublicKey={sessionPublicKey}
          adapterPublicKey={adapterPublicKey}
          isWalletConnectedAndMatching={isWalletConnectedAndMatching}
          gameData={gameData}
          economy={economy}
          inventory={inventory}
        />
      </main>
    </div>
  );
};

export default GameUI;
