
'use client';

import React from 'react';
import type { ElementType } from 'react';
import { Button } from '@/components/ui/button';
// SheetTrigger is removed as it's now handled in GameUI.tsx
// import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'; 
import { Coins, Target, Bone, Zap, Shield, Magnet, AlertCircle } from 'lucide-react';
import Joystick from '@/components/shared/Joystick';
import type { StoreItemDefinition } from '@/lib/items';

interface GameOverlayUIProps {
  sessionCollectedUSDT: number;
  remainingCoinsOnMap: number;
  COIN_COUNT: number;
  protectionBoneCount: number;
  protectionBoneDef?: StoreItemDefinition;

  isSpeedBoostActive: boolean;
  speedBoostTimeLeft: number;
  isShieldActive: boolean;
  shieldTimeLeft: number;
  isCoinMagnetActive: boolean;
  coinMagnetTimeLeft: number;

  speedyPawsTreatDef?: StoreItemDefinition;
  guardianShieldDef?: StoreItemDefinition;
  coinMagnetTreatDef?: StoreItemDefinition;

  speedyPawsTreatCount: number;
  guardianShieldCount: number;
  coinMagnetTreatCount: number;

  onUseConsumableItem: (itemId: string) => void;
  // Props for toggling sheets are removed as triggers are now in GameUI
  // onToggleStore: (open: boolean) => void;
  // onToggleInventory: (open: boolean) => void;
  // onToggleMenu: (open: boolean) => void;

  // Props for sheet open states are removed as they are not directly used for disabling these buttons anymore
  // isStoreOpen: boolean;
  // isInventoryOpen: boolean;
  // isMenuOpen: boolean;

  isGameEffectivelyPaused: boolean;
  isWalletMismatch: boolean;

  isMobile: boolean;
  dynamicJoystickState: {
    visible: boolean;
    baseScreenX: number;
    baseScreenY: number;
    knobOffsetX: number;
    knobOffsetY: number;
  };
  JOYSTICK_BASE_SIZE: number;
  JOYSTICK_KNOB_SIZE: number;
}

const GameOverlayUI: React.FC<GameOverlayUIProps> = ({
  sessionCollectedUSDT,
  remainingCoinsOnMap,
  COIN_COUNT,
  protectionBoneCount,
  protectionBoneDef,
  isSpeedBoostActive,
  speedBoostTimeLeft,
  isShieldActive,
  shieldTimeLeft,
  isCoinMagnetActive,
  coinMagnetTimeLeft,
  speedyPawsTreatDef,
  guardianShieldDef,
  coinMagnetTreatDef,
  speedyPawsTreatCount,
  guardianShieldCount,
  coinMagnetTreatCount,
  onUseConsumableItem,
  // onToggleStore, // Removed
  // onToggleInventory, // Removed
  // onToggleMenu, // Removed
  // isStoreOpen, // Removed
  // isInventoryOpen, // Removed
  // isMenuOpen, // Removed
  isGameEffectivelyPaused,
  isWalletMismatch,
  isMobile,
  dynamicJoystickState,
  JOYSTICK_BASE_SIZE,
  JOYSTICK_KNOB_SIZE,
}) => {
  const SpeedyPawsIcon = speedyPawsTreatDef?.icon || Zap;
  const GuardianShieldIcon = guardianShieldDef?.icon || Shield;
  const ProtectionBoneIcon = protectionBoneDef?.icon || Bone;
  const CoinMagnetIcon = coinMagnetTreatDef?.icon || Magnet;

  return (
    <>
      {isWalletMismatch && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center animate-pulse">
          <AlertCircle className="h-5 w-5 mr-2 rtl:ml-2" />
          <span>Wallet Mismatch! Align wallet in extension or reconnect. Actions paused.</span>
        </div>
      )}

      <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-primary/80 text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex flex-col md:flex-row items-center md:justify-center space-y-1 md:space-y-0 md:space-x-4 ${isWalletMismatch ? 'mt-12' : ''}`}>
        <div className="flex items-center">
          <Coins className="h-5 w-5 mr-2 rtl:ml-2" />
          <span>{sessionCollectedUSDT.toFixed(4)} USDT</span>
        </div>
        <div className="flex items-center text-xs opacity-90">
          <Target className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
          <span>Coins: {remainingCoinsOnMap} / {COIN_COUNT}</span>
        </div>
        {protectionBoneDef && (
          <div className="flex items-center text-xs opacity-90">
            <ProtectionBoneIcon className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
            <span>Bones: {protectionBoneCount}</span>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
        {isSpeedBoostActive && speedBoostTimeLeft > 0 && (
          <div className="bg-yellow-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Zap className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> Speed Boost! ({speedBoostTimeLeft}s)
          </div>
        )}
        {isShieldActive && shieldTimeLeft > 0 && (
          <div className="bg-blue-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Shield className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> Shield Active! ({shieldTimeLeft}s)
          </div>
        )}
        {isCoinMagnetActive && coinMagnetTimeLeft > 0 && (
          <div className="bg-purple-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Magnet className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> Coin Magnet! ({coinMagnetTimeLeft}s)
          </div>
        )}
      </div>

      <div className="absolute bottom-16 left-6 z-10 flex flex-col space-y-3">
        {coinMagnetTreatDef && (
          <Button
            onClick={() => onUseConsumableItem('4')}
            disabled={coinMagnetTreatCount === 0 || (isGameEffectivelyPaused && !isCoinMagnetActive)}
            variant="outline" size="icon" className="relative rounded-full h-14 w-14 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary group"
          >
            <CoinMagnetIcon className="h-7 w-7 text-purple-500 group-disabled:text-muted-foreground" />
            {coinMagnetTreatCount > 0 && (<span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{coinMagnetTreatCount}</span>)}
          </Button>
        )}
        {speedyPawsTreatDef && (
          <Button
            onClick={() => onUseConsumableItem('3')}
            disabled={speedyPawsTreatCount === 0 || (isGameEffectivelyPaused && !isSpeedBoostActive)}
            variant="outline" size="icon" className="relative rounded-full h-14 w-14 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary group"
          >
            <SpeedyPawsIcon className="h-7 w-7 text-yellow-500 group-disabled:text-muted-foreground" />
            {speedyPawsTreatCount > 0 && (<span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{speedyPawsTreatCount}</span>)}
          </Button>
        )}
        {guardianShieldDef && (
          <Button
            onClick={() => onUseConsumableItem('2')}
            disabled={guardianShieldCount === 0 || (isGameEffectivelyPaused && !isShieldActive)}
            variant="outline" size="icon" className="relative rounded-full h-14 w-14 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary group"
          >
            <GuardianShieldIcon className="h-7 w-7 text-blue-500 group-disabled:text-muted-foreground" />
            {guardianShieldCount > 0 && (<span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{guardianShieldCount}</span>)}
          </Button>
        )}
      </div>

      {/* SheetTrigger buttons for Store, Inventory, Menu are removed from here and now live in GameUI.tsx */}

      {isMobile && !isGameEffectivelyPaused && !isWalletMismatch && dynamicJoystickState.visible && (
        <Joystick
          baseScreenPosition={{ x: dynamicJoystickState.baseScreenX, y: dynamicJoystickState.baseScreenY }}
          knobScreenOffset={{ x: dynamicJoystickState.knobOffsetX, y: dynamicJoystickState.knobOffsetY }}
          size={JOYSTICK_BASE_SIZE}
          knobSize={JOYSTICK_KNOB_SIZE}
        />
      )}
    </>
  );
};

export default GameOverlayUI;
