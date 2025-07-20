'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
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

// Game Constants
const USDT_PER_COIN = 0.001;
const MIN_WITHDRAWAL_USDT = 0.5;
const SPEED_BOOST_DURATION = 30;
const SHIELD_DURATION = 30;
const COIN_MAGNET_DURATION = 30;
const COIN_MAGNET_RADIUS = 8;
const ENEMY_COLLISION_PENALTY_USDT = 0.001;
const COIN_COUNT_FOR_GAME_LOGIC = 1000;

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
                throw new Error(data.error || 'Failed to fetch player data.');
            }
        } catch (error) {
            console.error("Error fetching player data from backend:", error);
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

        // Optimistically increment the player's game USDT balance
        setPlayerGameUSDT(prev => prev + USDT_PER_COIN);

        try {
            const response = await fetch('/api/game/addCoin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}`
                },
                body: JSON.stringify({ amount: USDT_PER_COIN })
            });
            const data = await response.json();

            if (response.ok) {
                // Backend confirmed, no need to update again unless there's a slight discrepancy
                // For simplicity, we trust the optimistic update here. If backend returns a different value,
                // fetchPlayerData will eventually sync it.
            } else {
                // If backend fails, rollback the local balance
                setPlayerGameUSDT(prev => prev - USDT_PER_COIN);
                throw new Error(data.error || 'Failed to add coin.');
            }
        } catch (error) {
            console.error("Error adding coin to backend:", error);
            toast({ title: 'Sync Error', description: `Could not update your total USDT balance: ${error}`, variant: 'destructive' });
            // Ensure rollback if an error occurs
            setPlayerGameUSDT(prev => prev - USDT_PER_COIN);
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, toast]);

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
        setSpeedBoostTimeLeft(prevTime => {
            const newTime = prevTime + (SPEED_BOOST_DURATION * amount);
            if (newTime > 0 && !isSpeedBoostActive) {
                setIsSpeedBoostActive(true);
                if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
                speedBoostIntervalRef.current = setInterval(() => {
                    setSpeedBoostTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(speedBoostIntervalRef.current!);
                            speedBoostIntervalRef.current = null;
                            setIsSpeedBoostActive(false);
                            setShouldShowSpeedBoostWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
            }
            return newTime;
        });
        toast({ title: "Speed Boost Activated!", description: `You're running faster for ${SPEED_BOOST_DURATION * amount} seconds.` });
    }, [isSpeedBoostActive, toast]);

    /**
     * Activates or extends the Guardian Shield effect.
     */
    const activateGuardianShield = useCallback((amount: number) => {
        setShieldTimeLeft(prevTime => {
            const newTime = prevTime + (SHIELD_DURATION * amount);
            if (newTime > 0 && !isShieldActive) {
                setIsShieldActive(true);
                if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
                shieldIntervalRef.current = setInterval(() => {
                    setShieldTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(shieldIntervalRef.current!);
                            shieldIntervalRef.current = null;
                            setIsShieldActive(false);
                            setShouldShowShieldWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
            }
            return newTime;
        });
        toast({ title: "Guardian Shield Activated!", description: `You're protected for ${SHIELD_DURATION * amount} seconds.` });
    }, [isShieldActive, toast]);

    /**
     * Activates or extends the Coin Magnet effect.
     */
    const activateCoinMagnet = useCallback((amount: number) => {
        setCoinMagnetTimeLeft(prevTime => {
            const newTime = prevTime + (COIN_MAGNET_DURATION * amount);
            if (newTime > 0 && !isCoinMagnetActive) {
                setIsCoinMagnetActive(true);
                if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
                coinMagnetIntervalRef.current = setInterval(() => {
                    setCoinMagnetTimeLeft(pTime => {
                        if (pTime <= 1) {
                            clearInterval(coinMagnetIntervalRef.current!);
                            coinMagnetIntervalRef.current = null;
                            setIsCoinMagnetActive(false);
                            setShouldShowCoinMagnetWoreOffToast(true);
                            return 0;
                        }
                        return pTime - 1;
                    });
                }, 1000);
            }
            return newTime;
        });
        toast({ title: "Coin Magnet Activated!", description: `Collecting nearby coins for ${COIN_MAGNET_DURATION * amount} seconds.` });
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
        let activationFunction: ((amount: number) => void) | undefined; // Updated type
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

        // Optimistically decrement the item count
        if (itemIdToConsume === '3') {
            setSpeedyPawsTreatCount(prev => prev - amountToUse);
        } else if (itemIdToConsume === '2') {
            setGuardianShieldCount(prev => prev - amountToUse);
        } else if (itemIdToConsume === '4') {
            setCoinMagnetTreatCount(prev => prev - amountToUse);
        }

        try {
            const response = await fetch('/api/game/useItem', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}`
                },
                body: JSON.stringify({ itemId: itemIdToConsume, amount: amountToUse }) // Pass amount
            });
            const data = await response.json();

            if (response.ok) {
                if(activationFunction) activationFunction(amountToUse); // Pass amount to activation function
                toast({ title: 'Item Used!', description: `${amountToUse} ${itemDefinition.name}(s) consumed.`, variant: 'default' });
                fetchPlayerData(); // Re-fetch inventory to ensure sync
            } else {
                // If backend fails, rollback the local count
                if (itemIdToConsume === '3') {
                    setSpeedyPawsTreatCount(prev => prev + amountToUse);
                } else if (itemIdToConsume === '2') {
                    setGuardianShieldCount(prev => prev + amountToUse);
                } else if (itemIdToConsume === '4') {
                    setCoinMagnetTreatCount(prev => prev + amountToUse);
                }
                throw new Error(data.error || `Failed to use ${itemDefinition.name}.`);
            }
        } catch (error) {
            console.error("Error using item via backend:", error);
            toast({ title: 'Failed to Use Item', description: `Could not consume ${itemDefinition?.name || 'item'}. Error: ${error}`, variant: 'destructive' });
            // Ensure rollback if an error occurs
            if (itemIdToConsume === '3') {
                setSpeedyPawsTreatCount(prev => prev + amountToUse);
            } else if (itemIdToConsume === '2') {
                setGuardianShieldCount(prev => prev + amountToUse);
            } else if (itemIdToConsume === '4') {
                setCoinMagnetTreatCount(prev => prev + amountToUse);
            }
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, speedyPawsTreatCount, guardianShieldCount, coinMagnetTreatCount, activateSpeedBoost, activateGuardianShield, activateCoinMagnet, speedyPawsTreatDef, guardianShieldDef, coinMagnetTreatDef, toast, fetchPlayerData]);

    /**
     * Handles the withdrawal of USDT from the player's game balance via backend API.
     */
    const handleWithdrawUSDT = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || playerGameUSDT < MIN_WITHDRAWAL_USDT) {
            toast({ title: "Withdrawal Unavailable", description: `Please connect and authenticate your wallet, and ensure you have at least ${MIN_WITHDRAWAL_USDT} USDT. Your balance: ${playerGameUSDT.toFixed(4)} USDT`, variant: "destructive" }); return;
        }


        setIsWithdrawing(true);
        toast({ title: "Initiating Withdrawal...", description: "Processing your request." });

        // Optimistically decrement the player's game USDT balance
        const oldBalance = playerGameUSDT;
        setPlayerGameUSDT(prev => Math.max(0, prev - MIN_WITHDRAWAL_USDT));

        try {
            const response = await fetch('/api/game/withdrawUSDT', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}`
                },
                body: JSON.stringify({ amount: MIN_WITHDRAWAL_USDT })
            });
            const data = await response.json();

            if (response.ok) {
                // Backend confirmed, no need to update again unless there's a slight discrepancy
                // For simplicity, we trust the optimistic update here. If backend returns a different value,
                // fetchPlayerData will eventually sync it.
                toast({ title: "Withdrawal Successful", description: `${MIN_WITHDRAWAL_USDT} USDT withdrawn.`, duration: 7000 });
            } else {
                // If backend fails, rollback the local balance
                setPlayerGameUSDT(oldBalance);
                throw new Error(data.error || 'Withdrawal failed.');
            }
        } catch (error) {
            console.error("Error withdrawing USDT via backend:", error);
            toast({ title: "Withdrawal Error", description: `Withdrawal failed: ${error}`, variant: "destructive" });
            // Ensure rollback if an error occurs
            setPlayerGameUSDT(oldBalance);
        } finally {
            setIsWithdrawing(false);
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, playerGameUSDT, toast]);

    /**
     * Handles the consumption of a Protection Bone via backend API.
     */
    const handleConsumeProtectionBone = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || protectionBoneCount <= 0) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet, or you have no bones left.', variant: 'destructive' });
            return;
        }

        // Optimistically decrement the count
        setProtectionBoneCount(prev => prev - 1);

        try {
            const response = await fetch('/api/game/consumeProtectionBone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}`
                }
            });
            const data = await response.json();

            if (response.ok) {
                toast({ title: 'Protected!', description: 'A Protection Bone was used!', variant: 'default' });
                fetchPlayerData(); // Re-fetch inventory to ensure sync
            } else {
                // If backend fails, rollback the local count
                setProtectionBoneCount(prev => prev + 1);
                throw new Error(data.error || 'Failed to consume protection bone.');
            }
        } catch (error) {
            console.error("Error consuming protection bone via backend:", error);
            toast({ title: 'Failed to Use Bone', description: `Could not consume Protection Bone. Error: ${error}`, variant: 'destructive' });
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, protectionBoneCount, toast, fetchPlayerData]);

    /**
     * Applies a penalty to the player's game USDT balance upon enemy collision via backend API.
     */
    const handleEnemyCollisionPenalty = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet to apply penalties.', variant: 'destructive' });
            return;
        }

        // Optimistically decrement the player's game USDT balance
        setPlayerGameUSDT(prev => Math.max(0, prev - ENEMY_COLLISION_PENALTY_USDT));
        toast({ title: 'Ouch!', description: `Lost ${ENEMY_COLLISION_PENALTY_USDT.toFixed(4)} USDT from enemy collision!`, variant: 'destructive' });

        try {
            const response = await fetch('/api/game/applyPenalty', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authUser.publicKey}`
                },
                body: JSON.stringify({ amount: ENEMY_COLLISION_PENALTY_USDT })
            });
            const data = await response.json();

            if (response.ok) {
                // Backend confirmed, no need to update again unless there's a slight discrepancy
                // For simplicity, we trust the optimistic update here. If backend returns a different value,
                // fetchPlayerData will eventually sync it.
            } else {
                // If backend fails, rollback the local balance
                setPlayerGameUSDT(prev => prev + ENEMY_COLLISION_PENALTY_USDT);
                throw new Error(data.error || 'Failed to apply penalty.');
            }

        } catch (error) {
            console.error("Error applying enemy collision penalty via backend:", error);
            toast({ title: 'Penalty Error', description: `Could not apply penalty. Error: ${error}`, variant: 'destructive' });
            // Ensure rollback if an error occurs
            setPlayerGameUSDT(prev => prev + ENEMY_COLLISION_PENALTY_USDT);
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, toast]);


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
                    protectionBoneCount={protectionBoneCount}
                    onConsumeProtectionBone={handleConsumeProtectionBone}
                    onEnemyCollisionPenalty={handleEnemyCollisionPenalty}
                    COIN_COUNT={COIN_COUNT_FOR_GAME_LOGIC}
                />

                <GameOverlayUI
                    // Props for displaying game information and joystick
                    sessionCollectedUSDT={sessionCollectedUSDT}
                    remainingCoinsOnMap={remainingCoinsOnMap}
                    COIN_COUNT={COIN_COUNT_FOR_GAME_LOGIC}
                    protectionBoneCount={protectionBoneCount}
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
                    speedyPawsTreatCount={speedyPawsTreatCount}
                    guardianShieldCount={guardianShieldCount}
                    coinMagnetTreatCount={coinMagnetTreatCount}
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
                                playerGameUSDT={playerGameUSDT}
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
                           />
                        </SheetContent>
                    </Sheet>

                </div>
            </main>
        </div>
    );
};

export default GameUI;
