"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import { GameSheets } from "@/components/game/ui/GameSheets";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/auth/useAuth";
import { useSessionWallet } from "@/hooks/auth/useSessionWallet";
import { useGameData } from "@/hooks/game-ui/useGameData";
import { useGameEconomy } from "@/hooks/game-ui/useGameEconomy";
import { useGameInventory } from "@/hooks/game-ui/useGameInventory";
import Image from "next/image";
import React, { useEffect, useState } from "react";

interface GameMainMenuProps {
  onGameModeSelected: (mode: "boby-world" | "running-game") => void;
  onSheetsStateChange?: (isOpen: boolean) => void;
}

/**
 * GameModeOption - Sub-component for individual game mode selection cards
 */
interface GameModeOptionProps {
  id: "boby-world" | "running-game";
  title: string;
  description: string;
  imageSrc: string;
  selected: boolean;
  onSelect: (id: "boby-world" | "running-game") => void;
}

const GameModeOption: React.FC<GameModeOptionProps> = ({
  id,
  title,
  description,
  imageSrc,
  selected,
  onSelect,
}) => (
  <Label
    htmlFor={id}
    className={`game-mode-label flex flex-col items-center justify-between border p-8 md:p-8 cursor-pointer transition-all duration-200 glass-card hover:bg-primary/10
        ${selected ? "border-primary" : "border-border hover:border-primary/50"}`}
    onClick={() => onSelect(id)}
  >
    <RadioGroupItem value={id} id={id} className="sr-only" />
    <Image
      src={imageSrc}
      alt={title}
      width={100}
      height={100}
      className="mb-4 rounded-md w-24 md:w-32 h-auto"
    />
    <span className="text-lg md:text-2xl font-semibold text-foreground text-center">{title}</span>
    <span className="text-sm md:text-base text-muted-foreground text-center">{description}</span>
  </Label>
);

const GameMainMenu: React.FC<GameMainMenuProps> = ({ onGameModeSelected, onSheetsStateChange }) => {
  const [selectedMode, setSelectedMode] = useState<"boby-world" | "running-game">("boby-world");
  const [sheets, setSheets] = useState({ menu: false, store: false, wallet: false, inventory: false });
  const { isAuthenticated, user: authUser, isWalletConnectedAndMatching } = useAuth();
  const { sessionPublicKey, adapterPublicKey, isWalletMismatch } = useSessionWallet();
  
  const gameData = useGameData({ sessionPublicKey: sessionPublicKey?.toBase58() });
  const { fetchPlayerData } = gameData;
  const economy = useGameEconomy({
    isAuthenticated,
    isWalletConnectedAndMatching,
    authUserPublicKey: authUser?.publicKey,
    playerGameUSDT: gameData.playerGameUSDT,
    fetchPlayerData,
    updateBalanceLocally: gameData.updateBalanceLocally,
    lastSyncId: gameData.lastSyncId,
  });
  const inventory = useGameInventory({
    isAuthenticated,
    isWalletConnectedAndMatching,
    authUserPublicKey: authUser?.publicKey,
    fetchPlayerData,
    protectionBottleCount: gameData.protectionBottleCount,
    guardianShieldCount: gameData.guardianShieldCount,
    speedyPawsTreatCount: gameData.speedyPawsTreatCount,
    coinMagnetTreatCount: gameData.coinMagnetTreatCount,
    activateSpeedBoost: () => () => {},
    activateGuardianShield: () => () => {},
    activateCoinMagnet: () => () => {},
  });

  const toggleSheet = (key: "menu" | "store" | "wallet" | "inventory", val: boolean) => {
    setSheets(prev => ({ ...prev, [key]: val }));
  };
  const isPaused = Object.values(sheets).some(Boolean) || isWalletMismatch;

  // إبلاغ الأب بحالة الـ sheets حتى يضبط zIndex زر الصوت
  useEffect(() => {
    onSheetsStateChange?.(isPaused);
  }, [isPaused, onSheetsStateChange]);

  return (
    <div className="game-main-menu-page min-h-screen bg-background text-foreground px-4 sm:px-6 relative">
      

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

      <div className="game-menu-card-wrapper flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md md:max-w-2xl game-main-menu-card glass-card overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-center text-2xl md:text-4xl text-foreground">
              Select Game Mode
            </CardTitle>
            <CardDescription className="text-center text-base md:text-lg text-muted-foreground">
              Choose your adventure!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup
              value={selectedMode}
              onValueChange={(value: "boby-world" | "running-game") => setSelectedMode(value)}
              className="game-mode-grid grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <GameModeOption
                id="boby-world"
                title="Boby World"
                description="Explore an open 3D world."
                imageSrc="/Boby-logo.png"
                selected={selectedMode === "boby-world"}
                onSelect={onGameModeSelected}
              />
              <GameModeOption
                id="running-game"
                title="Running Game"
                description="Run, jump, and collect coins!"
                imageSrc="/Boby-logo.png"
                selected={selectedMode === "running-game"}
                onSelect={onGameModeSelected}
              />
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GameMainMenu;
