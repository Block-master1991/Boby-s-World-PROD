
'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

import { Target, Droplet, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import Joystick from '@/components/shared/Joystick';
import type { StoreItemDefinition } from '@/lib/items';

interface GameOverlayUIProps {
  sessionCollectedUSDT: number;
  remainingCoinsOnMap: number;
  COIN_COUNT: number;
  protectionBottleCount: number;
  protectionBottleDef?: StoreItemDefinition;

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

  onUseConsumableItem: (itemId: string, amount: number) => void; // Updated to accept amount


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
  protectionBottleCount,
  protectionBottleDef,
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

  isGameEffectivelyPaused,
  isWalletMismatch,
  isMobile,
  dynamicJoystickState,
  JOYSTICK_BASE_SIZE,
  JOYSTICK_KNOB_SIZE,
}) => {

  const ProtectionBottleIcon = protectionBottleDef?.icon || Droplet;


  return (
    <>
      {isWalletMismatch && (
        <div className="absolute top-[calc(1.5rem+var(--sat))] left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center animate-pulse">
          <AlertCircle className="h-5 w-5 mr-2 rtl:ml-2" />
          <span>Wallet Mismatch! Align wallet in extension or reconnect. Actions paused.</span>
        </div>
      )}

      <div className={`absolute top-[calc(1rem+var(--sat))] left-1/2 -translate-x-1/2 z-20 bg-primary/80 text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex flex-col md:flex-row items-center md:justify-center space-y-1 md:space-y-0 md:space-x-4 ${isWalletMismatch ? 'mt-12' : ''}`}>
        <div className="flex items-center">
          <Image src="/USDT-logo.png" alt="USDT Icon" width={20} height={20} className="h-5 w-5 mr-2 rtl:ml-2" />
          <span>{sessionCollectedUSDT.toFixed(4)} USDT</span>
        </div>
        <div className="flex items-center text-xs opacity-90">
          <Target className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
          <span>Coins: {remainingCoinsOnMap} / {COIN_COUNT}</span>
        </div>
        {protectionBottleDef && (
          <div className="flex items-center text-xs opacity-90">
            <ProtectionBottleIcon className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
            <span>Bottles: {protectionBottleCount}</span>
          </div>
        )}
      </div>

      <div className="absolute top-[calc(2.5rem+var(--sat))] right-[calc(1rem+var(--sar))] z-20 flex flex-col space-y-2">
        {isSpeedBoostActive && speedBoostTimeLeft > 0 && (
          <div className="bg-yellow-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Image src="/items/speedyPawsTreat.png" alt="Speed Boost" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({speedBoostTimeLeft}s)
          </div>
        )}
        {isShieldActive && shieldTimeLeft > 0 && (
          <div className="bg-blue-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Image src="/items/guardianShield.png" alt="Guardian Shield" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({shieldTimeLeft}s)
          </div>
        )}
        {isCoinMagnetActive && coinMagnetTimeLeft > 0 && (
          <div className="bg-purple-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
            <Image src="/items/coinMagnetTreat.png" alt="Coin Magnet" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({coinMagnetTimeLeft}s)
          </div>
        )}

      </div>

      <div className="absolute bottom-[calc(4rem+var(--sab))] left-[calc(0.5rem+var(--sal))] z-10 flex flex-col space-y-3">
        {coinMagnetTreatDef && (
          <Button
            onClick={() => onUseConsumableItem('4', 1)} // Pass amount as 1
            disabled={coinMagnetTreatCount === 0 || (isGameEffectivelyPaused && !isCoinMagnetActive)}
            className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none">
            <Image src="/items/coinMagnetTreat.png" alt="Coin Magnet" width={56} height={56} className="h-full w-full object-contain" />
            {coinMagnetTreatCount > 0 && (<span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">{coinMagnetTreatCount}</span>)}
          </Button>
        )}
        {speedyPawsTreatDef && (
          <Button
            onClick={() => onUseConsumableItem('3', 1)} // Pass amount as 1
            disabled={speedyPawsTreatCount === 0 || (isGameEffectivelyPaused && !isSpeedBoostActive)}
            className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none"
          >
            <Image src="/items/speedyPawsTreat.png" alt="Speedy Paws" width={56} height={56} className="h-full w-full object-contain" />
            {speedyPawsTreatCount > 0 && (<span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">{speedyPawsTreatCount}</span>)}
          </Button>
        )}
        {guardianShieldDef && (
          <Button
            onClick={() => onUseConsumableItem('2', 1)} // Pass amount as 1
            disabled={guardianShieldCount === 0 || (isGameEffectivelyPaused && !isShieldActive)}
            className="relative h-14 w-14 p-0 bg-transparent hover:bg-transparent shadow-none"
          >
            <Image src="/items/guardianShield.png" alt="Guardian Shield" width={56} height={56} className="h-full w-full object-contain" />
            {guardianShieldCount > 0 && (<span className="absolute -bottom-1 -right-1 text-black font-bold text-xs flex items-center justify-center">{guardianShieldCount}</span>)}
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
