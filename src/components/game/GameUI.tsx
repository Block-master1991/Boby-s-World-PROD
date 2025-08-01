'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import GameCanvas from '@/components/game/GameCanvas';
import InGameStore from '@/components/game/InGameStore';
import PlayerInventory from '@/components/game/PlayerInventory';
import GameOverlayUI from '@/components/game/ui/GameOverlayUI';
import GameMenuSheetContent from '@/components/game/ui/GameMenuSheetContent';
import PlayerWallet from '@/components/game/ui/PlayerWallet'
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useSessionWallet } from '@/hooks/useSessionWallet';

import { useToast } from '@/hooks/use-toast';
import { storeItems, type StoreItemDefinition } from '@/lib/items'; // Assuming '@/lib/items' defines store items
import { fetchWithCsrf } from '@/lib/utils'; // استيراد fetchWithCsrf

// Game Constants
const USDT_PER_COIN = 0.001;
const MIN_WITHDRAWAL_USDT = 0.5;
const SPEED_BOOST_DURATION = 30;
const SHIELD_DURATION = 30;
const COIN_MAGNET_DURATION = 30;
const COIN_MAGNET_RADIUS = 8;
const ENEMY_COLLISION_PENALTY_USDT = 0.001;
const COIN_COUNT_FOR_GAME_LOGIC = 1000;

// Define types for optimistic updates
interface OptimisticUpdate {
    id: string; // Unique ID for the update
    type: 'coin' | 'penalty' | 'useItem' | 'consumeBone' | 'withdraw';
    amount?: number; // For coin/penalty/withdraw
    itemId?: string; // For useItem
    timestamp: number;
    status: 'pending' | 'failed'; // 'completed' updates will be removed
}

// Joystick Constants
const JOYSTICK_BASE_SIZE = 120;
const JOYSTICK_KNOB_SIZE = 40;
const MAX_JOYSTICK_TRAVEL = (JOYSTICK_BASE_SIZE / 2) - (JOYSTICK_KNOB_SIZE / 2);


const GameUI: React.FC = () => {
    const isMobile = useIsMobile();
    const {
        sessionPublicKey,
        adapterPublicKey,
        isWalletMismatch,
    } = useSessionWallet();
    const {
        isAuthenticated,
        user: authUser,
        isWalletConnectedAndMatching,
    } = useAuth();
    const { toast } = useToast();

    // UI State
    const [isStoreOpen, setIsStoreOpen] = useState(false);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isWalletOpen, setIsWalletOpen] = useState(false);

    // New State for pending optimistic updates
    const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([]);
    // Queue for bone consumption requests
    const boneConsumptionQueueRef = useRef<Array<{ id: string; resolve: (success: boolean) => void; reject: (error: any) => void }>>([]);
    const isProcessingBoneQueueRef = useRef(false);

    // Game Effect States
    const [isSpeedBoostActive, setIsSpeedBoostActive] = useState(false);
    const [speedBoostTimeLeft, setSpeedBoostTimeLeft] = useState(0);
    const speedBoostIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [shouldShowSpeedBoostWoreOffToast, setShouldShowSpeedBoostWoreOffToast] = useState(false);

    const [isShieldActive, setIsShieldActive] = useState(false);
    const [shieldTimeLeft, setShieldTimeLeft] = useState(0);
    const shieldIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [shouldShowShieldWoreOffToast, setShouldShowShieldWoreOffToast] = useState(false);

    const [isCoinMagnetActive, setIsCoinMagnetActive] = useState(false);
    const [coinMagnetTimeLeft, setCoinMagnetTimeLeft] = useState(0);
    const coinMagnetIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [shouldShowCoinMagnetWoreOffToast, setShouldShowCoinMagnetWoreOffToast] = useState(false);

    // Inventory Item Counts (will be populated from backend data)
    const [speedyPawsTreatCount, setSpeedyPawsTreatCount] = useState(0);
    const [guardianShieldCount, setGuardianShieldCount] = useState(0);
    const [protectionBoneCount, setProtectionBoneCount] = useState(0);
    const [coinMagnetTreatCount, setCoinMagnetTreatCount] = useState(0);

    // Player Economy State
    const [sessionCollectedUSDT, setSessionCollectedUSDT] = useState(0); // USDT collected during current game session
    const [playerGameUSDT, setPlayerGameUSDT] = useState<number>(0); // Total game USDT from Backend
    const [isFetchingPlayerUSDT, setIsFetchingPlayerUSDT] = useState<boolean>(true);
    const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

    // Game World State
    const [remainingCoinsOnMap, setRemainingCoinsOnMap] = useState<number>(COIN_COUNT_FOR_GAME_LOGIC);

    // Joystick State
    const [joystickMovement, setJoystickMovement] = useState<{x: number, y: number} | null>(null);
    const [dynamicJoystickState, setDynamicJoystickState] = useState({
      visible: false,
      baseScreenX: 0,
      baseScreenY: 0,
      knobOffsetX: 0,
      knobOffsetY: 0,
    });

    // Item Definitions (from '@/lib/items')
    const speedyPawsTreatDef = storeItems.find(item => item.id === '3');
    const guardianShieldDef = storeItems.find(item => item.id === '2');
    const protectionBoneDef = storeItems.find(item => item.id === '1');
    const coinMagnetTreatDef = storeItems.find(item => item.id === '4');

    // Derived State for game pausing
    const isGameEffectivelyPaused = isMenuOpen || isStoreOpen || isInventoryOpen || isWalletOpen || isWalletMismatch;

    // Derived State for displayed values
    const displayedPlayerGameUSDT = useMemo(() => {
        let currentUSDT = playerGameUSDT;
        optimisticUpdates.forEach(update => {
            if (update.status === 'pending') {
                if (update.type === 'coin') {
                    currentUSDT += (update.amount || 0);
                } else if (update.type === 'penalty' || update.type === 'withdraw') {
                    currentUSDT -= (update.amount || 0);
                }
            }
        });
        return currentUSDT;
    }, [playerGameUSDT, optimisticUpdates]);

    const displayedProtectionBoneCount = useMemo(() => {
        let currentCount = protectionBoneCount;
        optimisticUpdates.forEach(update => {
            if (update.status === 'pending' && update.type === 'consumeBone') {
                currentCount -= (update.amount || 1);
            }
        });
        return currentCount;
    }, [protectionBoneCount, optimisticUpdates]);

    const displayedSpeedyPawsTreatCount = useMemo(() => {
        let currentCount = speedyPawsTreatCount;
        optimisticUpdates.forEach(update => {
            if (update.status === 'pending' && update.type === 'useItem' && update.itemId === '3') {
                currentCount -= (update.amount || 1);
            }
        });
        return currentCount;
    }, [speedyPawsTreatCount, optimisticUpdates]);

    const displayedGuardianShieldCount = useMemo(() => {
        let currentCount = guardianShieldCount;
        optimisticUpdates.forEach(update => {
            if (update.status === 'pending' && update.type === 'useItem' && update.itemId === '2') {
                currentCount -= (update.amount || 1);
            }
        });
        return currentCount;
    }, [guardianShieldCount, optimisticUpdates]);

    const displayedCoinMagnetTreatCount = useMemo(() => {
        let currentCount = coinMagnetTreatCount;
        optimisticUpdates.forEach(update => {
            if (update.status === 'pending' && update.type === 'useItem' && update.itemId === '4') {
                currentCount -= (update.amount || 1);
            }
        });
        return currentCount;
    }, [coinMagnetTreatCount, optimisticUpdates]);


    /**
     * Fetches player data from the backend API.
     */
    const fetchPlayerData = useCallback(async () => {
        if (!isAuthenticated || !authUser?.publicKey) {
            setIsFetchingPlayerUSDT(false);
            return;
        }

        setIsFetchingPlayerUSDT(true);
        try {
            const response = await fetch('/api/game/fetchPlayerData', { // Updated path
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}` // Send public key for auth
                }
            });
            const data = await response.json();

            if (response.ok) {
                setPlayerGameUSDT(data.gameUSDTBalance || 0);
                // Assume backend sends inventory as an array of item IDs or similar for counts
                const rawInventory = data.inventory || [];
                let speedyCount = 0, shieldCount = 0, pBoneCount = 0, magnetCount = 0;
                rawInventory.forEach((item: any) => {
                    const itemId = typeof item === 'object' && item.id ? item.id : item; // Handle object or just ID
                    if (itemId === '1') pBoneCount++;
                    if (itemId === '2') shieldCount++;
                    if (itemId === '3') speedyCount++;
                    if (itemId === '4') magnetCount++;
                });
                setProtectionBoneCount(pBoneCount);
                setGuardianShieldCount(shieldCount);
                setSpeedyPawsTreatCount(speedyCount);
                setCoinMagnetTreatCount(magnetCount);
            } else {
                console.error("Backend error fetching player data:", data.error || 'Failed to fetch player data.'); // Log error instead of throwing
            }
        } catch (error) {
            console.error("Network or unexpected error fetching player data from backend:", error);
            toast({ title: 'Data Sync Error', description: `Could not fetch player data: ${error}`, variant: 'destructive' });
            // Reset counts and balance on error or if not authenticated
            setProtectionBoneCount(0); setGuardianShieldCount(0); setSpeedyPawsTreatCount(0); setCoinMagnetTreatCount(0); setPlayerGameUSDT(0);
        } finally {
            setIsFetchingPlayerUSDT(false);
        }
    }, [isAuthenticated, authUser?.publicKey, toast]);

    /**
     * Handles the start of a touch event on the canvas for joystick control.
     * @param screenX The X coordinate of the touch on the screen.
     * @param screenY The Y coordinate of the touch on the screen.
     */
    const handleCanvasTouchStart = useCallback((screenX: number, screenY: number) => {
        // Only allow touch input if on mobile, game is not paused, user is authenticated, and wallet is connected/matching
        if (!isMobile || isGameEffectivelyPaused || !isAuthenticated || !isWalletConnectedAndMatching) return;
        setDynamicJoystickState({
            visible: true,
            baseScreenX: screenX,
            baseScreenY: screenY,
            knobOffsetX: 0,
            knobOffsetY: 0,
        });
        setJoystickMovement({ x: 0, y: 0 }); // Initialize joystick movement
    }, [isMobile, isGameEffectivelyPaused, isAuthenticated, isWalletConnectedAndMatching]);

    /**
     * Handles the movement of a touch event on the canvas for joystick control.
     * Calculates and normalizes joystick movement based on touch delta.
     * @param rawDeltaX The raw change in X coordinate since touch start.
     * @param rawDeltaY The raw change in Y coordinate since touch start.
     */
    const handleCanvasTouchMove = useCallback((rawDeltaX: number, rawDeltaY: number) => {
        if (!dynamicJoystickState.visible) return; // Only process if joystick is visible/active

        let dx = rawDeltaX;
        let dy = rawDeltaY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Limit joystick knob travel to MAX_JOYSTICK_TRAVEL radius
        if (distance > MAX_JOYSTICK_TRAVEL) {
            dx = (dx / distance) * MAX_JOYSTICK_TRAVEL;
            dy = (dy / distance) * MAX_JOYSTICK_TRAVEL;
        }

        setDynamicJoystickState(prev => ({
            ...prev,
            knobOffsetX: dx,
            knobOffsetY: dy,
        }));

        // Normalize joystick movement to a range of -1 to 1
        const normX = MAX_JOYSTICK_TRAVEL === 0 ? 0 : dx / MAX_JOYSTICK_TRAVEL;
        const normY = MAX_JOYSTICK_TRAVEL === 0 ? 0 : dy / MAX_JOYSTICK_TRAVEL;
        setJoystickMovement({ x: normX, y: normY });
    }, [dynamicJoystickState.visible]);

    /**
     * Handles the end of a touch event on the canvas, resetting joystick state.
     */
    const handleCanvasTouchEnd = useCallback(() => {
        if (!dynamicJoystickState.visible) return;
        setDynamicJoystickState({
            visible: false,
            baseScreenX: 0,
            baseScreenY: 0,
            knobOffsetX: 0,
            knobOffsetY: 0,
        });
        setJoystickMovement({ x: 0, y: 0 }); // Reset joystick movement to center
    }, [dynamicJoystickState.visible]);


    /**
     * Callback function for when a coin is collected in the game.
     * Increments session collected USDT and calls backend to update player's balance.
     */
    const handleCoinCollected = useCallback(async () => {
        setSessionCollectedUSDT(prev => prev + USDT_PER_COIN);
        
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey) {
            toast({ title: 'Action Blocked', description: 'Please ensure your wallet is connected and authenticated to collect coins.', variant: 'destructive' });
            return;
        }

        const updateId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        setOptimisticUpdates(prev => [...prev, {
            id: updateId,
            type: 'coin',
            amount: USDT_PER_COIN,
            timestamp: Date.now(),
            status: 'pending'
        }]);

        try {
            const response = await fetchWithCsrf('/api/game/addCoin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: USDT_PER_COIN })
            });
            const data = await response.json();

            if (response.ok) {
                // On success, re-fetch data to sync, then remove the optimistic update
                await fetchPlayerData();
                setOptimisticUpdates(prev => prev.filter(update => update.id !== updateId));
            } else {
                // On failure, mark as failed or remove and show error
                setOptimisticUpdates(prev => prev.map(update =>
                    update.id === updateId ? { ...update, status: 'failed' } : update
                ));
                console.error("Backend error adding coin:", data.error || 'Failed to add coin.'); // Log error instead of throwing
            }
        } catch (error: any) {
            console.error("Network or unexpected error adding coin to backend:", error);
            let errorMessage = `Could not update your total USDT balance: ${error.message || String(error)}`;
            if (error.message && error.message.includes('CSRF token missing')) {
                errorMessage = 'Security error: Missing CSRF token. Please try logging in again.';
            }
            toast({ title: 'Sync Error', description: errorMessage, variant: 'destructive' });
            // Ensure rollback by marking as failed if an error occurs
            setOptimisticUpdates(prev => prev.map(update =>
                update.id === updateId ? { ...update, status: 'failed' } : update
            ));
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, toast, fetchPlayerData]);

    /**
     * Callback function for when the remaining coins on the map update.
     * @param remaining The number of coins still left on the map.
     */
    const handleRemainingCoinsUpdate = useCallback((remaining: number) => {
        setRemainingCoinsOnMap(remaining);
    }, []);

    /**
     * useEffect hook for managing player data fetch from backend.
     * This runs on component mount and when authentication or user public key changes.
     */
    useEffect(() => {
        fetchPlayerData();
        // Clear any active intervals for game effects on unmount
        
    return () => {
            if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
            if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
            if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
        };
    }, [isAuthenticated, authUser?.publicKey, fetchPlayerData]); // Dependencies: isAuthenticated and authUser.publicKey

    // Effect to show toast when Speed Boost wears off
    useEffect(() => {
        if (shouldShowSpeedBoostWoreOffToast) {
            toast({ title: "Speed Boost Wore Off." });
            setShouldShowSpeedBoostWoreOffToast(false);
        }
    }, [shouldShowSpeedBoostWoreOffToast, toast]);

    // Effect to show toast when Guardian Shield wears off
    useEffect(() => {
        if (shouldShowShieldWoreOffToast) {
            toast({ title: "Guardian Shield Wore Off." });
            setShouldShowShieldWoreOffToast(false);
        }
    }, [shouldShowShieldWoreOffToast, toast]);

    // Effect to show toast when Coin Magnet wears off
    useEffect(() => {
        if (shouldShowCoinMagnetWoreOffToast) {
            toast({ title: "Coin Magnet Wore Off." });
            setShouldShowCoinMagnetWoreOffToast(false);
        }
    }, [shouldShowCoinMagnetWoreOffToast, toast]);

    /**
     * Activates or extends the Speed Boost effect.
     */
    const activateSpeedBoost = useCallback((amount: number) => {
        let currentIntervalId: NodeJS.Timeout | null = null;
        setSpeedBoostTimeLeft(prevTime => {
            const newTime = prevTime + (SPEED_BOOST_DURATION * amount);
            if (newTime > 0 && !isSpeedBoostActive) {
                setIsSpeedBoostActive(true);
                if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
                currentIntervalId = setInterval(() => {
                    setSpeedBoostTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(currentIntervalId!);
                            currentIntervalId = null;
                            setIsSpeedBoostActive(false);
                            setShouldShowSpeedBoostWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
                speedBoostIntervalRef.current = currentIntervalId;
            }
            return newTime;
        });
        toast({ title: "Speed Boost Activated!", description: `You're running faster for ${SPEED_BOOST_DURATION * amount} seconds.` });

        return () => { // Rollback function
            if (currentIntervalId) clearInterval(currentIntervalId);
            if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
            speedBoostIntervalRef.current = null;
            setIsSpeedBoostActive(false);
            setSpeedBoostTimeLeft(0);
            toast({ title: "Speed Boost Rolled Back", description: "The speed boost was cancelled due to a backend error.", variant: "destructive" });
        };
    }, [isSpeedBoostActive, toast]);

    /**
     * Activates or extends the Guardian Shield effect.
     */
    const activateGuardianShield = useCallback((amount: number) => {
        let currentIntervalId: NodeJS.Timeout | null = null;
        setShieldTimeLeft(prevTime => {
            const newTime = prevTime + (SHIELD_DURATION * amount);
            if (newTime > 0 && !isShieldActive) {
                setIsShieldActive(true);
                if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
                currentIntervalId = setInterval(() => {
                    setShieldTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(currentIntervalId!);
                            currentIntervalId = null;
                            setIsShieldActive(false);
                            setShouldShowShieldWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
                shieldIntervalRef.current = currentIntervalId;
            }
            return newTime;
        });
        toast({ title: "Guardian Shield Activated!", description: `You're protected for ${SHIELD_DURATION * amount} seconds.` });

        return () => { // Rollback function
            if (currentIntervalId) clearInterval(currentIntervalId);
            if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
            shieldIntervalRef.current = null;
            setIsShieldActive(false);
            setShieldTimeLeft(0);
            toast({ title: "Guardian Shield Rolled Back", description: "The shield was cancelled due to a backend error.", variant: "destructive" });
        };
    }, [isShieldActive, toast]);

    /**
     * Activates or extends the Coin Magnet effect.
     */
    const activateCoinMagnet = useCallback((amount: number) => {
        let currentIntervalId: NodeJS.Timeout | null = null;
        setCoinMagnetTimeLeft(prevTime => {
            const newTime = prevTime + (COIN_MAGNET_DURATION * amount);
            if (newTime > 0 && !isCoinMagnetActive) {
                setIsCoinMagnetActive(true);
                if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
                currentIntervalId = setInterval(() => {
                    setCoinMagnetTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(currentIntervalId!);
                            currentIntervalId = null;
                            setIsCoinMagnetActive(false);
                            setShouldShowCoinMagnetWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
                coinMagnetIntervalRef.current = currentIntervalId;
            }
            return newTime;
        });
        toast({ title: "Coin Magnet Activated!", description: `Collecting nearby coins for ${COIN_MAGNET_DURATION * amount} seconds.` });

        return () => { // Rollback function
            if (currentIntervalId) clearInterval(currentIntervalId);
            if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
            coinMagnetIntervalRef.current = null;
            setIsCoinMagnetActive(false);
            setCoinMagnetTimeLeft(0);
            toast({ title: "Coin Magnet Rolled Back", description: "The coin magnet was cancelled due to a backend error.", variant: "destructive" });
        };
    }, [isCoinMagnetActive, toast]);

    /**
     * Handles the consumption of a consumable item via backend API.
     * @param itemIdToConsume The ID of the item to consume.
     * @param amountToUse The quantity of the item to consume.
     */
    const handleUseConsumableItem = useCallback(async (itemIdToConsume: string, amountToUse: number) => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey) {
            toast({ title: 'Error', description: 'Please connect and authenticate your wallet to use items.', variant: 'destructive' }); return;
        }
        if (amountToUse <= 0) {
            toast({ title: 'Invalid Quantity', description: 'Please enter a quantity greater than 0.', variant: 'destructive' }); return;
        }

        // Determine which item to consume based on the provided ID
        let itemDefinition: StoreItemDefinition | undefined;
        let activationFunction: ((amount: number) => (() => void)) | undefined; // Updated type to return rollback function
        let currentItemCount = 0;

        if (itemIdToConsume === '3') {
            itemDefinition = speedyPawsTreatDef;
            activationFunction = activateSpeedBoost;
            currentItemCount = speedyPawsTreatCount;
        } else if (itemIdToConsume === '2') {
            itemDefinition = guardianShieldDef;
            activationFunction = activateGuardianShield;
            currentItemCount = guardianShieldCount;
        } else if (itemIdToConsume === '4') {
            itemDefinition = coinMagnetTreatDef;
            activationFunction = activateCoinMagnet;
            currentItemCount = coinMagnetTreatCount;
        } else {
            toast({ title: 'Unknown Item', description: 'This item cannot be used this way.', variant: 'destructive'}); return;
        }

        if (!itemDefinition) {
             toast({ title: 'Item Error', description: 'Item definition not found.', variant: 'destructive'}); return;
        }
        if (currentItemCount < amountToUse) {
            toast({ title: 'No Items Left', description: `You don't have enough ${itemDefinition.name}. You have ${currentItemCount}, but tried to use ${amountToUse}.`, variant: 'destructive'}); return;
        }

        let rollbackEffect: (() => void) | undefined;

        // Optimistically activate the effect and get its rollback function
        if (activationFunction) {
            rollbackEffect = activationFunction(amountToUse);
        }

        const updateId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        setOptimisticUpdates(prev => [...prev, {
            id: updateId,
            type: 'useItem',
            itemId: itemIdToConsume,
            amount: amountToUse,
            timestamp: Date.now(),
            status: 'pending',
            rollbackEffect: rollbackEffect // Store the rollback function
        }]);

        try {
            const response = await fetchWithCsrf('/api/game/useItem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ itemId: itemIdToConsume, amount: amountToUse })
            });
            const data = await response.json();

            if (response.ok) {
                //toast({ title: 'Item Used!', description: `${amountToUse} ${itemDefinition.name}(s) consumed.`, variant: 'default' });
                await fetchPlayerData(); // Await fetchPlayerData before removing optimistic update
                setOptimisticUpdates(prev => prev.filter(update => update.id !== updateId));
            } else {
                // If backend fails, rollback the local count and the effect
                setOptimisticUpdates(prev => prev.map(update =>
                    update.id === updateId ? { ...update, status: 'failed' } : update
                ));
                if (rollbackEffect) rollbackEffect(); // Call rollback effect
                console.error("Backend error using item:", data.error || `Failed to use ${itemDefinition.name}.`); // Log error instead of throwing
            }
        } catch (error: any) {
            console.error("Network or unexpected error using item via backend:", error);
            let errorMessage = `Could not consume ${itemDefinition?.name || 'item'}. Error: ${error.message || String(error)}`;
            if (error.message && error.message.includes('CSRF token missing')) {
                errorMessage = 'Security error: Missing CSRF token. Please try logging in again.';
            }
            toast({ title: 'Failed to Use Item', description: errorMessage, variant: 'destructive' });
            setOptimisticUpdates(prev => prev.map(update =>
                update.id === updateId ? { ...update, status: 'failed' } : update
            ));
            if (rollbackEffect) rollbackEffect(); // Call rollback effect
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, displayedSpeedyPawsTreatCount, displayedGuardianShieldCount, displayedCoinMagnetTreatCount, activateSpeedBoost, activateGuardianShield, activateCoinMagnet, speedyPawsTreatDef, guardianShieldDef, coinMagnetTreatDef, toast, fetchPlayerData]);

    /**
     * Handles the withdrawal of USDT from the player's game balance via backend API.
     */
    const handleWithdrawUSDT = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || displayedPlayerGameUSDT < MIN_WITHDRAWAL_USDT) { // Use displayed value for check
            toast({ title: "Withdrawal Unavailable", description: `Please connect and authenticate your wallet, and ensure you have at least ${MIN_WITHDRAWAL_USDT} USDT. Your balance: ${displayedPlayerGameUSDT.toFixed(4)} USDT`, variant: "destructive" }); return;
        }

        setIsWithdrawing(true);
        toast({ title: "Initiating Withdrawal...", description: "Processing your request." });

        const updateId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        setOptimisticUpdates(prev => [...prev, {
            id: updateId,
            type: 'withdraw',
            amount: MIN_WITHDRAWAL_USDT,
            timestamp: Date.now(),
            status: 'pending'
        }]);

        try {
            const response = await fetchWithCsrf('/api/game/withdrawUSDT', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: MIN_WITHDRAWAL_USDT })
            });
            const data = await response.json();

            if (response.ok) {
                await fetchPlayerData(); // Await fetchPlayerData before removing optimistic update
                setOptimisticUpdates(prev => prev.filter(update => update.id !== updateId));
                toast({ title: "Withdrawal Successful", description: `${MIN_WITHDRAWAL_USDT} USDT withdrawn.`, duration: 7000 });
            } else {
                setOptimisticUpdates(prev => prev.map(update =>
                    update.id === updateId ? { ...update, status: 'failed' } : update
                ));
                console.error("Backend error withdrawing USDT:", data.error || 'Withdrawal failed.'); // Log error instead of throwing
            }
        } catch (error: any) {
            console.error("Network or unexpected error withdrawing USDT via backend:", error);
            let errorMessage = `Withdrawal failed: ${error.message || String(error)}`;
            if (error.message && error.message.includes('CSRF token missing')) {
                errorMessage = 'Security error: Missing CSRF token. Please try logging in again.';
            }
            toast({ title: "Withdrawal Error", description: errorMessage, variant: "destructive" });
            setOptimisticUpdates(prev => prev.map(update =>
                update.id === updateId ? { ...update, status: 'failed' } : update
            ));
        } finally {
            setIsWithdrawing(false);
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, displayedPlayerGameUSDT, toast, fetchPlayerData]);

    /**
     * Handles the consumption of a Protection Bone via backend API.
     */
    const handleConsumeProtectionBone = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || displayedProtectionBoneCount <= 0) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet, or you have no bones left.', variant: 'destructive' });
            return;
        }

        const updateId = Date.now().toString() + Math.random().toString(36).substring(2, 9);

        // Add optimistic update immediately
        setOptimisticUpdates(prev => [...prev, {
            id: updateId,
            type: 'consumeBone',
            amount: 1,
            timestamp: Date.now(),
            status: 'pending'
        }]);

        // Enqueue the request
        boneConsumptionQueueRef.current.push({
            id: updateId,
            resolve: (success) => {
                if (success) {
                    //toast({ title: 'Protected!', description: 'A Protection Bone was used!', variant: 'default' });
                } else {
                    // Error toast is handled by processBoneConsumptionQueue
                }
            },
            reject: (error) => {
                // Error toast is handled by processBoneConsumptionQueue
            }
        });

        // Trigger queue processing if not already running
        if (!isProcessingBoneQueueRef.current) {
            processBoneConsumptionQueue();
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, displayedProtectionBoneCount, toast, optimisticUpdates]);

    // New function to process the bone consumption queue
    const processBoneConsumptionQueue = useCallback(async () => {
        if (isProcessingBoneQueueRef.current || boneConsumptionQueueRef.current.length === 0) {
            return;
        }

        isProcessingBoneQueueRef.current = true;

        while (boneConsumptionQueueRef.current.length > 0) {
            const { id: updateId, resolve, reject } = boneConsumptionQueueRef.current[0]; // Peek at the first item

            try {
                const response = await fetchWithCsrf('/api/game/consumeProtectionBone', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                const data = await response.json();

                if (response.ok) {
                    await fetchPlayerData(); // Await fetchPlayerData before removing optimistic update
                    setOptimisticUpdates(prev => prev.filter(update => update.id !== updateId)); // Remove on success
                    resolve(true);
                } else {
                    setOptimisticUpdates(prev => prev.map(update =>
                        update.id === updateId ? { ...update, status: 'failed' } : update
                    ));
                    console.error("Backend error consuming protection bone:", data.error || 'Failed to consume protection bone.');
                    let errorMessage = `Could not consume Protection Bone. Backend error: ${data.error || 'Unknown error'}`;
                    toast({ title: 'Failed to Use Bone', description: errorMessage, variant: 'destructive' });
                    resolve(false); // Indicate failure
                }
            } catch (error: any) {
                setOptimisticUpdates(prev => prev.map(update =>
                    update.id === updateId ? { ...update, status: 'failed' } : update
                ));
                console.error("Network or unexpected error consuming protection bone via backend:", error);
                let errorMessage = `Could not consume Protection Bone. Network error: ${error.message || String(error)}`;
                if (error.message && errorMessage.includes('CSRF token missing')) {
                    errorMessage = 'Security error: Missing CSRF token. Please try logging in again.';
                }
                toast({ title: 'Failed to Use Bone', description: errorMessage, variant: 'destructive' });
                reject(error); // Indicate failure
            } finally {
                boneConsumptionQueueRef.current.shift(); // Remove the processed item from queue
            }
        }

        isProcessingBoneQueueRef.current = false;
    }, [isAuthenticated, authUser?.publicKey, toast, fetchPlayerData, optimisticUpdates]);

    /**
     * Applies a penalty to the player's game USDT balance upon enemy collision via backend API.
     */
    const handleEnemyCollisionPenalty = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet to apply penalties.', variant: 'destructive' });
            return;
        }

        toast({ title: 'Ouch!', description: `Lost ${ENEMY_COLLISION_PENALTY_USDT.toFixed(4)} USDT from enemy collision!`, variant: 'destructive' });

        const updateId = Date.now().toString() + Math.random().toString(36).substring(2, 9);
        setOptimisticUpdates(prev => [...prev, {
            id: updateId,
            type: 'penalty',
            amount: ENEMY_COLLISION_PENALTY_USDT,
            timestamp: Date.now(),
            status: 'pending'
        }]);

        try {
            const response = await fetchWithCsrf('/api/game/applyPenalty', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ amount: ENEMY_COLLISION_PENALTY_USDT })
            });
            const data = await response.json();

            if (response.ok) {
                await fetchPlayerData(); // Await fetchPlayerData before removing optimistic update
                setOptimisticUpdates(prev => prev.filter(update => update.id !== updateId));
            } else {
                setOptimisticUpdates(prev => prev.map(update =>
                    update.id === updateId ? { ...update, status: 'failed' } : update
                ));
                console.error("Backend error applying enemy collision penalty:", data.error || 'Failed to apply penalty.'); // Log error instead of throwing
            }

        } catch (error: any) {
            console.error("Network or unexpected error applying enemy collision penalty via backend:", error);
            let errorMessage = `Could not apply penalty. Error: ${error.message || String(error)}`;
            if (error.message && errorMessage.includes('CSRF token missing')) {
                errorMessage = 'Security error: Missing CSRF token. Please try logging in again.';
            }
            toast({ title: 'Penalty Error', description: errorMessage, variant: 'destructive' });
            setOptimisticUpdates(prev => prev.map(update =>
                update.id === updateId ? { ...update, status: 'failed' } : update
            ));
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, toast, fetchPlayerData]);


    return (
        <div className="relative flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
            <main className="flex-grow flex flex-col relative">
                <GameCanvas
                    // Props related to game state and callbacks
                    sessionPublicKey={sessionPublicKey}
                    isSpeedBoostActive={isSpeedBoostActive}
                    isShieldActive={isShieldActive}
                    isCoinMagnetActive={isCoinMagnetActive}
                    COIN_MAGNET_RADIUS={COIN_MAGNET_RADIUS}
                    onCoinCollected={handleCoinCollected}
                    onRemainingCoinsUpdate={handleRemainingCoinsUpdate}
                    isPaused={isGameEffectivelyPaused}
                    joystickInput={joystickMovement}
                    onCanvasTouchStart={handleCanvasTouchStart}
                    onCanvasTouchMove={handleCanvasTouchMove}
                    onCanvasTouchEnd={handleCanvasTouchEnd}
                    protectionBoneCount={displayedProtectionBoneCount}
                    onConsumeProtectionBone={handleConsumeProtectionBone}
                    onEnemyCollisionPenalty={handleEnemyCollisionPenalty}
                    COIN_COUNT={COIN_COUNT_FOR_GAME_LOGIC}
                    // New props for enemy logic
                    // coinMeshesRef will be passed from GameCanvas itself after useCoinLogic
                    // onCoinCollected is already passed
                />

                <GameOverlayUI
                    // Props for displaying game information and joystick
                    sessionCollectedUSDT={sessionCollectedUSDT}
                    remainingCoinsOnMap={remainingCoinsOnMap}
                    COIN_COUNT={COIN_COUNT_FOR_GAME_LOGIC}
                    protectionBoneCount={displayedProtectionBoneCount}
                    protectionBoneDef={protectionBoneDef}
                    isSpeedBoostActive={isSpeedBoostActive}
                    speedBoostTimeLeft={speedBoostTimeLeft}
                    isShieldActive={isShieldActive}
                    shieldTimeLeft={shieldTimeLeft}
                    isCoinMagnetActive={isCoinMagnetActive}
                    coinMagnetTimeLeft={coinMagnetTimeLeft}
                    speedyPawsTreatDef={speedyPawsTreatDef}
                    guardianShieldDef={guardianShieldDef}
                    coinMagnetTreatDef={coinMagnetTreatDef}
                    speedyPawsTreatCount={displayedSpeedyPawsTreatCount}
                    guardianShieldCount={displayedGuardianShieldCount}
                    coinMagnetTreatCount={displayedCoinMagnetTreatCount}
                    onUseConsumableItem={handleUseConsumableItem}
                    isGameEffectivelyPaused={isGameEffectivelyPaused}
                    isWalletMismatch={isWalletMismatch}
                    isMobile={isMobile}
                    dynamicJoystickState={dynamicJoystickState}
                    JOYSTICK_BASE_SIZE={JOYSTICK_BASE_SIZE}
                    JOYSTICK_KNOB_SIZE={JOYSTICK_KNOB_SIZE}
                />

                {/* Sheet Triggers and Content */}
                <div className="absolute top-[calc(1rem+var(--sat))] left-[calc(1rem+var(--sal))] z-10">
                    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                        <SheetTrigger asChild>
                            <Button
                                onClick={() => setIsMenuOpen(true)}
                                disabled={(isGameEffectivelyPaused && !isMenuOpen) || isWalletMismatch}
                                className="h-12 w-12 overflow-hidden flex items-center justify-center p-0 border-none bg-transparent hover:bg-transparent"
                            >
                                <Image src="/GameMenu.png" alt="Game Menu" width={48} height={48} className="h-full w-full object-contain" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-full sm:max-w-xs p-0 flex flex-col">
                            <GameMenuSheetContent
                                isWalletMismatch={isWalletMismatch}
                                isAuthenticated={isAuthenticated}
                                authUserPublicKey={authUser?.publicKey}
                                sessionPublicKey={sessionPublicKey}
                                adapterPublicKey={adapterPublicKey}
                            />

                        </SheetContent>
                    </Sheet>
                </div>

                <div className="absolute bottom-[calc(4rem+var(--sab))] right-[calc(0.5rem+var(--sar))] z-10 flex flex-col space-y-3">
                    <Sheet open={isStoreOpen} onOpenChange={setIsStoreOpen}>
                        <SheetTrigger asChild>
                            <Button
                                onClick={() => setIsStoreOpen(true)}
                                disabled={(isGameEffectivelyPaused && !isStoreOpen) || isWalletMismatch}
                                className="h-12 w-12 overflow-hidden flex items-center justify-center p-0 border-none bg-transparent hover:bg-transparent"
                               
                            >
                                <Image src="/GameStore-lg.png" alt="Game Store" width={48} height={48} className="h-full w-full object-contain" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                            <InGameStore
                                isAuthenticated={isAuthenticated}
                                authUserPublicKey={authUser?.publicKey}
                                isWalletConnectedAndMatching={isWalletConnectedAndMatching}
                                onPurchaseSuccess={fetchPlayerData} // Add a callback to re-fetch player data after purchase
                            />
                        </SheetContent>
                    </Sheet>

                    <Sheet open={isWalletOpen} onOpenChange={setIsWalletOpen}>
                        <SheetTrigger asChild>
                            <Button
                                onClick={() => setIsWalletOpen(true)}
                                disabled={(isGameEffectivelyPaused && !isWalletOpen) || isWalletMismatch}
                                className="h-12 w-12 overflow-hidden flex items-center justify-center p-0 border-none bg-transparent hover:bg-transparent"
                            >
                                <Image src="/wallet.png" alt="Player Wallet" width={48} height={48} className="h-full w-full object-contain" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                            <PlayerWallet
                                isAuthenticated={isAuthenticated}
                                authUserPublicKey={authUser?.publicKey}
                                isWalletMismatch={isWalletMismatch}
                                sessionPublicKey={sessionPublicKey}
                                adapterPublicKey={adapterPublicKey}
                                isFetchingPlayerUSDT={isFetchingPlayerUSDT}
                                playerGameUSDT={displayedPlayerGameUSDT}
                                MIN_WITHDRAWAL_USDT={MIN_WITHDRAWAL_USDT}
                                isWithdrawing={isWithdrawing}
                                onWithdrawUSDT={handleWithdrawUSDT}
                            />
                        </SheetContent>
                    </Sheet>
                    
                    <Sheet open={isInventoryOpen} onOpenChange={setIsInventoryOpen}>
                        <SheetTrigger asChild>
                            <Button
                                onClick={() => setIsInventoryOpen(true)}
                                disabled={(isGameEffectivelyPaused && !isInventoryOpen) || isWalletMismatch}
                                className="h-12 w-12 overflow-hidden flex items-center justify-center p-0 border-none bg-transparent hover:bg-transparent"
                            > 
                                <Image src="/PlayerInventory.png" alt="Player Inventory" width={48} height={48} className="h-full w-full object-contain" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                           <PlayerInventory
                                onUseConsumableItem={handleUseConsumableItem}
                                speedyPawsTreatCount={displayedSpeedyPawsTreatCount}
                                guardianShieldCount={displayedGuardianShieldCount}
                                protectionBoneCount={displayedProtectionBoneCount}
                                coinMagnetTreatCount={displayedCoinMagnetTreatCount}
                           />
                        </SheetContent>
                    </Sheet>

                </div>
            </main>
        </div>
    );
};

export default GameUI;
