import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { useEffect, useMemo, useState } from 'react';
import { useGameData } from './useGameData';
import { useGameEconomy } from './useGameEconomy';
import { useGameEffects } from './useGameEffects';
import { useGameInventory } from './useGameInventory';
import { useJoystickControls } from './useJoystickControls';

interface UseGameControllerProps {
    octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
    onSheetsStateChange?: (isAnySheetOpen: boolean) => void;
    onLoadStart: () => void;
    onLoadProgress: (progress: number) => void;
    onLoadComplete: (success: boolean) => void;
}

export const useGameController = ({ onSheetsStateChange }: UseGameControllerProps) => {
    const isMobile = useIsMobile();
    const { sessionPublicKey, adapterPublicKey, isWalletMismatch } = useSessionWallet();
    const { isAuthenticated, user: authUser, isWalletConnectedAndMatching } = useAuth();
    
    // Core Logic Hooks
    const gameData = useGameData({ sessionPublicKey: sessionPublicKey?.toBase58() });
    const { fetchPlayerData } = gameData;
    const economy = useGameEconomy({ isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey: authUser?.publicKey, playerGameUSDT: gameData.playerGameUSDT, fetchPlayerData });
    const effects = useGameEffects();
    const inventory = useGameInventory({
        isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey: authUser?.publicKey, fetchPlayerData,
        protectionBottleCount: gameData.protectionBottleCount, guardianShieldCount: gameData.guardianShieldCount, speedyPawsTreatCount: gameData.speedyPawsTreatCount, coinMagnetTreatCount: gameData.coinMagnetTreatCount,
        activateSpeedBoost: effects.activateSpeedBoost, activateGuardianShield: effects.activateGuardianShield, activateCoinMagnet: effects.activateCoinMagnet
    });

    // Sheet State
    const [sheets, setSheets] = useState({ menu: false, store: false, wallet: false, inventory: false });
    const toggleSheet = (key: keyof typeof sheets, val: boolean) => setSheets(p => ({ ...p, [key]: val }));
    const isPaused = Object.values(sheets).some(Boolean) || isWalletMismatch;
    
    // Input
    const joystick = useJoystickControls({ isMobile, isGameEffectivelyPaused: isPaused, isAuthenticated, isWalletConnectedAndMatching });

    useEffect(() => { if (isAuthenticated && authUser?.publicKey) fetchPlayerData(); }, [isAuthenticated, authUser, fetchPlayerData]);
    useEffect(() => { onSheetsStateChange?.(isPaused); }, [isPaused, onSheetsStateChange]);

    const overlayProps = useMemo(() => ({
        sessionCollectedUSDT: economy.sessionCollectedUSDT, remainingCoinsOnMap: economy.remainingCoinsOnMap,
        COIN_COUNT: economy.COIN_COUNT_FOR_GAME_LOGIC, protectionBottleCount: inventory.displayedProtectionBottleCount,
        isSpeedBoostActive: effects.isSpeedBoostActive, speedBoostTimeLeft: effects.speedBoostTimeLeft,
        isShieldActive: effects.isShieldActive, shieldTimeLeft: effects.shieldTimeLeft,
        isCoinMagnetActive: effects.isCoinMagnetActive, coinMagnetTimeLeft: effects.coinMagnetTimeLeft,
        speedyPawsTreatCount: inventory.displayedSpeedyPawsTreatCount, guardianShieldCount: inventory.displayedGuardianShieldCount, coinMagnetTreatCount: inventory.displayedCoinMagnetTreatCount,
        onUseConsumableItem: inventory.handleUseConsumableItem,
        isGameEffectivelyPaused: isPaused, isWalletMismatch, isMobile, dynamicJoystickState: joystick.dynamicJoystickState,
        JOYSTICK_BASE_SIZE: joystick.JOYSTICK_BASE_SIZE, JOYSTICK_KNOB_SIZE: joystick.JOYSTICK_KNOB_SIZE,
        ...(inventory.protectionBottleDef ? { protectionBottleDef: inventory.protectionBottleDef } : {}),
        ...(inventory.speedyPawsTreatDef ? { speedyPawsTreatDef: inventory.speedyPawsTreatDef } : {}),
        ...(inventory.guardianShieldDef ? { guardianShieldDef: inventory.guardianShieldDef } : {}),
        ...(inventory.coinMagnetTreatDef ? { coinMagnetTreatDef: inventory.coinMagnetTreatDef } : {})
    }), [economy, inventory, effects, isPaused, isWalletMismatch, isMobile, joystick]);

    return {
        sessionPublicKey, adapterPublicKey, isWalletMismatch, isAuthenticated, authUser, isWalletConnectedAndMatching,
        gameData, economy, inventory, effects, joystick, sheets, toggleSheet, isPaused, overlayProps
    };
};
