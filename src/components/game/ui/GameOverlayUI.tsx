
'use client';

import React from 'react';


import Joystick from '@/components/shared/Joystick';
import type { StoreItemDefinition } from '@/lib/items';
import { ActiveEffects } from './ActiveEffects';
import { ConsumablesToolbar } from './ConsumablesToolbar';
import { StatsOverlay } from './StatsOverlay';
import { WalletMismatchBanner } from './WalletMismatchBanner';

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
  onUseConsumableItem: (itemId: string, amount: number) => void;
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

const GameOverlayUI: React.FC<GameOverlayUIProps> = (props) => {
  const { isWalletMismatch, isMobile, isGameEffectivelyPaused, dynamicJoystickState, JOYSTICK_BASE_SIZE, JOYSTICK_KNOB_SIZE } = props;

  return (
    <>
      {isWalletMismatch && <WalletMismatchBanner />}

      <StatsOverlay
        sessionCollectedUSDT={props.sessionCollectedUSDT}
        remainingCoinsOnMap={props.remainingCoinsOnMap}
        COIN_COUNT={props.COIN_COUNT}
        protectionBottleCount={props.protectionBottleCount}
        protectionBottleDef={props.protectionBottleDef}
        isWalletMismatch={isWalletMismatch}
      />

      <ActiveEffects
        isSpeedBoostActive={props.isSpeedBoostActive}
        speedBoostTimeLeft={props.speedBoostTimeLeft}
        isShieldActive={props.isShieldActive}
        shieldTimeLeft={props.shieldTimeLeft}
        isCoinMagnetActive={props.isCoinMagnetActive}
        coinMagnetTimeLeft={props.coinMagnetTimeLeft}
      />

      <ConsumablesToolbar
        coinMagnetTreatDef={props.coinMagnetTreatDef}
        speedyPawsTreatDef={props.speedyPawsTreatDef}
        guardianShieldDef={props.guardianShieldDef}
        coinMagnetTreatCount={props.coinMagnetTreatCount}
        speedyPawsTreatCount={props.speedyPawsTreatCount}
        guardianShieldCount={props.guardianShieldCount}
        isGameEffectivelyPaused={isGameEffectivelyPaused}
        isCoinMagnetActive={props.isCoinMagnetActive}
        isSpeedBoostActive={props.isSpeedBoostActive}
        isShieldActive={props.isShieldActive}
        onUseConsumableItem={props.onUseConsumableItem}
      />

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
