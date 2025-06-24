
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import GameCanvas from '@/components/game/GameCanvas'; // COIN_COUNT is now an internal constant in useCoinLogic
import InGameStore from '@/components/game/InGameStore';
import PlayerInventory from '@/components/game/PlayerInventory';
import GameOverlayUI from '@/components/game/ui/GameOverlayUI';
import GameMenuSheetContent from '@/components/game/ui/GameMenuSheetContent';

import { useAuth } from '@/hooks/useAuth'; // Import useAuth

import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Backpack, Settings } from 'lucide-react';
import { useSessionWallet } from '@/hooks/useSessionWallet';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, onSnapshot, increment, arrayRemove, writeBatch } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { storeItems, type StoreItemDefinition } from '@/lib/items';


const USDT_PER_COIN = 0.001;
const MIN_WITHDRAWAL_USDT = 0.5;
const SPEED_BOOST_DURATION = 30;
const SHIELD_DURATION = 30;
const COIN_MAGNET_DURATION = 30;
const COIN_MAGNET_RADIUS = 8; // This will be used by GameCanvas
const ENEMY_COLLISION_PENALTY_USDT = 0.001;
const COIN_COUNT_FOR_GAME_LOGIC = 1000; // Pass this to GameCanvas if it needs it, or let useCoinLogic handle it internally

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
        isAuthenticated, // Get isAuthenticated from useAuth
        user: authUser,  // Get authenticated user from useAuth
        isWalletConnectedAndMatching, // Import isWalletConnectedAndMatching
    } = useAuth();
    const { toast } = useToast();

    const [isStoreOpen, setIsStoreOpen] = useState(false);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

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

    const [speedyPawsTreatCount, setSpeedyPawsTreatCount] = useState(0);
    const [guardianShieldCount, setGuardianShieldCount] = useState(0);
    const [protectionBoneCount, setProtectionBoneCount] = useState(0);
    const [coinMagnetTreatCount, setCoinMagnetTreatCount] = useState(0);

    const [sessionCollectedUSDT, setSessionCollectedUSDT] = useState(0);
    const [playerGameUSDT, setPlayerGameUSDT] = useState<number>(0);
    const [isFetchingPlayerUSDT, setIsFetchingPlayerUSDT] = useState<boolean>(true);
    const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

    const [remainingCoinsOnMap, setRemainingCoinsOnMap] = useState<number>(COIN_COUNT_FOR_GAME_LOGIC);

    const [joystickMovement, setJoystickMovement] = useState<{x: number, y: number} | null>(null);
    const [dynamicJoystickState, setDynamicJoystickState] = useState({
      visible: false,
      baseScreenX: 0,
      baseScreenY: 0,
      knobOffsetX: 0,
      knobOffsetY: 0,
    });

    const speedyPawsTreatDef = storeItems.find(item => item.id === '3');
    const guardianShieldDef = storeItems.find(item => item.id === '2');
    const protectionBoneDef = storeItems.find(item => item.id === '1');
    const coinMagnetTreatDef = storeItems.find(item => item.id === '4');

    const isGameEffectivelyPaused = isMenuOpen || isStoreOpen || isInventoryOpen || isWalletMismatch;

    const handleCanvasTouchStart = useCallback((screenX: number, screenY: number) => {
        // Only allow touch if authenticated and wallet is connected and matching
        if (!isMobile || isGameEffectivelyPaused || !isAuthenticated || !isWalletConnectedAndMatching) return;
        setDynamicJoystickState({
            visible: true,
            baseScreenX: screenX,
            baseScreenY: screenY,
            knobOffsetX: 0,
            knobOffsetY: 0,
        });
        setJoystickMovement({ x: 0, y: 0 });
    }, [isMobile, isGameEffectivelyPaused, isAuthenticated, isWalletConnectedAndMatching]);

    const handleCanvasTouchMove = useCallback((rawDeltaX: number, rawDeltaY: number) => {
        if (!dynamicJoystickState.visible) return;

        let dx = rawDeltaX;
        let dy = rawDeltaY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > MAX_JOYSTICK_TRAVEL) {
            dx = (dx / distance) * MAX_JOYSTICK_TRAVEL;
            dy = (dy / distance) * MAX_JOYSTICK_TRAVEL;
        }

        setDynamicJoystickState(prev => ({
            ...prev,
            knobOffsetX: dx,
            knobOffsetY: dy,
        }));

        const normX = MAX_JOYSTICK_TRAVEL === 0 ? 0 : dx / MAX_JOYSTICK_TRAVEL;
        const normY = MAX_JOYSTICK_TRAVEL === 0 ? 0 : dy / MAX_JOYSTICK_TRAVEL;
        setJoystickMovement({ x: normX, y: normY });
    }, [dynamicJoystickState.visible]);

    const handleCanvasTouchEnd = useCallback(() => {
        if (!dynamicJoystickState.visible) return;
        setDynamicJoystickState({
            visible: false,
            baseScreenX: 0,
            baseScreenY: 0,
            knobOffsetX: 0,
            knobOffsetY: 0,
        });
        setJoystickMovement({ x: 0, y: 0 });
    }, [dynamicJoystickState.visible]);


    const handleCoinCollected = useCallback(async () => {
        setSessionCollectedUSDT(prev => prev + USDT_PER_COIN);
        // Only proceed if authenticated and wallet is connected and matching
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey) {
            toast({ title: 'Action Blocked', description: 'Please ensure your wallet is connected and authenticated to collect coins.', variant: 'destructive' });
            return;
        }
        if (db && db.app && db.app.options && db.app.options.projectId && !db.app.options.projectId.includes("YOUR_PROJECT_ID")) {
            try {
                const playerDocRef = doc(db, 'players', authUser.publicKey);
                await updateDoc(playerDocRef, {
                    gameUSDTBalance: increment(USDT_PER_COIN),
                    lastInteraction: serverTimestamp()
                });
            } catch (error) {
                console.error("Error incrementing gameUSDTBalance in Firestore:", error);
                toast({ title: 'Sync Error', description: 'Could not update your total USDT balance.', variant: 'destructive' });
            }
        }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUser?.publicKey, toast]); // setSessionCollectedUSDT is stable

    const handleRemainingCoinsUpdate = useCallback((remaining: number) => {
        setRemainingCoinsOnMap(remaining);
    }, []); // setRemainingCoinsOnMap is stable

    useEffect(() => {
        let unsubscribe: Unsubscribe | undefined;
        // Only subscribe to player data if authenticated and a user public key is available
        if (isAuthenticated && authUser?.publicKey && db && db.app && db.app.options) {
            setIsFetchingPlayerUSDT(true);
            const playerDocRef = doc(db, 'players', authUser.publicKey);

            const initializePlayerDocument = async () => {
                try {
                    const docSnap = await getDoc(playerDocRef);
                    if (!docSnap.exists()) {
                        await setDoc(playerDocRef, {
                            walletAddress: authUser.publicKey,
                            createdAt: serverTimestamp(),
                            lastLogin: serverTimestamp(),
                            inventory: [],
                            gameUSDTBalance: 0,
                        });
                        setPlayerGameUSDT(0);
                    } else {
                        await updateDoc(playerDocRef, { lastLogin: serverTimestamp() });
                        const initialData = docSnap.data();
                        setPlayerGameUSDT(initialData.gameUSDTBalance || 0);
                    }
                } catch (error) {
                    console.error("Error initializing player document in Firestore:", error);
                     if (db.app.options.projectId && (String(error).includes("PROJECT_ID_NOT_PROVIDED") || db.app.options.projectId.includes("YOUR_PROJECT_ID"))) {
                         toast({ title: 'Firebase Config Error', description: 'Firebase is not configured correctly. Player data may not save.', variant: 'destructive', duration: 7000});
                    } else if (String(error).toLowerCase().includes("permission") || String(error).toLowerCase().includes("denied")) {
                        toast({ title: 'Firestore Permission Error', description: 'Check Firestore security rules. Player data may not save/load.', variant: 'destructive', duration: 7000});
                    } else {
                        toast({ title: 'Firestore Error', description: `Could not initialize player data: ${error}`, variant: 'destructive', duration: 7000});
                    }
                } finally {
                    setIsFetchingPlayerUSDT(false);
                }
            };

            const currentProjectId = db.app.options.projectId;
            const currentApiKey = db.app.options.apiKey;

            if (!currentProjectId || (typeof currentProjectId === 'string' && currentProjectId.includes("YOUR_PROJECT_ID")) ||
                !currentApiKey || (typeof currentApiKey === 'string' && currentApiKey.startsWith("AIzaSy") && currentApiKey.length < 30)) {
                 toast({ title: 'Firebase Setup Needed', description: 'Please configure Firebase in src/lib/firebase.ts to save game progress.', variant: 'destructive', duration: 10000 });
                 setIsFetchingPlayerUSDT(false);
                 setSpeedyPawsTreatCount(0); setGuardianShieldCount(0); setProtectionBoneCount(0); setCoinMagnetTreatCount(0); setPlayerGameUSDT(0);
            } else {
                initializePlayerDocument().catch(err => {
                    console.error("Unhandled error from initializePlayerDocument promise:", err);
                    toast({ title: 'Critical Init Error', description: `Failed to initialize player data structure: ${err}`, variant: 'destructive' });
                    setIsFetchingPlayerUSDT(false);
                });
                unsubscribe = onSnapshot(playerDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const playerData = docSnap.data();
                        const currentRawInventory: any[] = playerData.inventory || [];
                        let speedyCount = 0, shieldCount = 0, pBoneCount = 0, magnetCount = 0;
                        currentRawInventory.forEach(entry => {
                            const itemId = typeof entry === 'object' && entry !== null ? entry.id : storeItems.find(si => si.name === entry)?.id;
                            if (itemId === '1') pBoneCount++;
                            if (itemId === '2') shieldCount++;
                            if (itemId === '3') speedyCount++;
                            if (itemId === '4') magnetCount++;
                        });
                        setProtectionBoneCount(pBoneCount);
                        setGuardianShieldCount(shieldCount);
                        setSpeedyPawsTreatCount(speedyCount);
                        setCoinMagnetTreatCount(magnetCount);
                        setPlayerGameUSDT(playerData.gameUSDTBalance || 0);
                    } else {
                        setProtectionBoneCount(0); setGuardianShieldCount(0); setSpeedyPawsTreatCount(0); setCoinMagnetTreatCount(0); setPlayerGameUSDT(0);
                    }
                    setIsFetchingPlayerUSDT(false);
                }, (error) => {
                    console.error("[GameUI] Error fetching player data snapshot:", error);
                    setProtectionBoneCount(0); setGuardianShieldCount(0); setSpeedyPawsTreatCount(0); setCoinMagnetTreatCount(0); setPlayerGameUSDT(0);
                    setIsFetchingPlayerUSDT(false);
                    toast({ title: 'Data Sync Error', description: 'Could not fetch latest player data.', variant: 'destructive' });
                });
            }
        } else {
            // If not authenticated or no user public key, clear all player-specific states
            setProtectionBoneCount(0); setGuardianShieldCount(0); setSpeedyPawsTreatCount(0); setCoinMagnetTreatCount(0); setPlayerGameUSDT(0);
            setIsFetchingPlayerUSDT(false);
        }
        return () => {
            if (unsubscribe) unsubscribe();
            if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
            if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
            if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
        };
    }, [isAuthenticated, authUser?.publicKey, toast]); // Depend on isAuthenticated and authUser.publicKey

    useEffect(() => {
        if (shouldShowSpeedBoostWoreOffToast) {
            toast({ title: "Speed Boost Wore Off." });
            setShouldShowSpeedBoostWoreOffToast(false);
        }
    }, [shouldShowSpeedBoostWoreOffToast, toast]);

    useEffect(() => {
        if (shouldShowShieldWoreOffToast) {
            toast({ title: "Guardian Shield Wore Off." });
            setShouldShowShieldWoreOffToast(false);
        }
    }, [shouldShowShieldWoreOffToast, toast]);

    useEffect(() => {
        if (shouldShowCoinMagnetWoreOffToast) {
            toast({ title: "Coin Magnet Wore Off." });
            setShouldShowCoinMagnetWoreOffToast(false);
        }
    }, [shouldShowCoinMagnetWoreOffToast, toast]);

    const activateSpeedBoost = () => {
        let newTimeLeft = speedBoostTimeLeft > 0 ? speedBoostTimeLeft + SPEED_BOOST_DURATION : SPEED_BOOST_DURATION;
        setSpeedBoostTimeLeft(newTimeLeft);
        setIsSpeedBoostActive(true);

        if (speedBoostTimeLeft > 0) {
            toast({ title: "Speed Boost Extended!", description: `Total duration now ${newTimeLeft} seconds.` });
        } else {
            toast({ title: "Speed Boost Activated!", description: `You're running faster for ${newTimeLeft} seconds.` });
        }

        if (speedBoostIntervalRef.current) clearInterval(speedBoostIntervalRef.current);
        speedBoostIntervalRef.current = setInterval(() => {
            setSpeedBoostTimeLeft(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(speedBoostIntervalRef.current!);
                    speedBoostIntervalRef.current = null;
                    setIsSpeedBoostActive(false);
                    setSpeedBoostTimeLeft(0);
                    setShouldShowSpeedBoostWoreOffToast(true);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    };

    const activateGuardianShield = () => {
        let newTimeLeft = shieldTimeLeft > 0 ? shieldTimeLeft + SHIELD_DURATION : SHIELD_DURATION;
        setShieldTimeLeft(newTimeLeft);
        setIsShieldActive(true);

        if (shieldTimeLeft > 0) {
             toast({ title: "Guardian Shield Extended!", description: `Total duration now ${newTimeLeft} seconds.` });
        } else {
            toast({ title: "Guardian Shield Activated!", description: `You're protected for ${newTimeLeft} seconds.` });
        }

        if (shieldIntervalRef.current) clearInterval(shieldIntervalRef.current);
        shieldIntervalRef.current = setInterval(() => {
            setShieldTimeLeft(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(shieldIntervalRef.current!);
                    shieldIntervalRef.current = null;
                    setIsShieldActive(false);
                    setShieldTimeLeft(0);
                    setShouldShowShieldWoreOffToast(true);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    };

    const activateCoinMagnet = () => {
        let newTimeLeft = coinMagnetTimeLeft > 0 ? coinMagnetTimeLeft + COIN_MAGNET_DURATION : COIN_MAGNET_DURATION;
        setCoinMagnetTimeLeft(newTimeLeft);
        setIsCoinMagnetActive(true);

        if (coinMagnetTimeLeft > 0) {
            toast({ title: "Coin Magnet Extended!", description: `Total duration now ${newTimeLeft} seconds.` });
        } else {
            toast({ title: "Coin Magnet Activated!", description: `Collecting nearby coins for ${newTimeLeft} seconds.` });
        }

        if (coinMagnetIntervalRef.current) clearInterval(coinMagnetIntervalRef.current);
        coinMagnetIntervalRef.current = setInterval(() => {
            setCoinMagnetTimeLeft(prevTime => {
                if (prevTime <= 1) {
                    clearInterval(coinMagnetIntervalRef.current!);
                    coinMagnetIntervalRef.current = null;
                    setIsCoinMagnetActive(false);
                    setCoinMagnetTimeLeft(0);
                    setShouldShowCoinMagnetWoreOffToast(true);
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);
    };

    const handleUseConsumableItem = async (itemIdToConsume: string) => {
        // Ensure authenticated and wallet is connected and matching for actions
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || !db) {
            toast({ title: 'Error', description: 'Please connect and authenticate your wallet to use items.', variant: 'destructive' }); return;
        }

        let currentProjectId: string | undefined;
        if (db.app && db.app.options) {
            currentProjectId = db.app.options.projectId;
        }

        if (!currentProjectId || (typeof currentProjectId === 'string' && currentProjectId.includes("YOUR_PROJECT_ID"))) {
            toast({ title: 'Firebase Not Configured', description: 'Cannot use item, Firebase is not set up.', variant: 'destructive' }); return;
        }

        let itemDefinition: StoreItemDefinition | undefined;
        let activationFunction: (() => void) | undefined;
        let currentItemCount = 0;

        if (itemIdToConsume === '3') {
            itemDefinition = speedyPawsTreatDef;
            activationFunction = activateSpeedBoost;
            currentItemCount = speedyPawsTreatCount;
        }
        else if (itemIdToConsume === '2') {
            itemDefinition = guardianShieldDef;
            activationFunction = activateGuardianShield;
            currentItemCount = guardianShieldCount;
        }
        else if (itemIdToConsume === '4') {
            itemDefinition = coinMagnetTreatDef;
            activationFunction = activateCoinMagnet;
            currentItemCount = coinMagnetTreatCount;
        }
        else {
            toast({ title: 'Unknown Item', description: 'This item cannot be used this way.', variant: 'destructive'}); return;
        }

        if (!itemDefinition) {
             toast({ title: 'Item Error', description: 'Item definition not found.', variant: 'destructive'}); return;
        }
        if (currentItemCount === 0) {
            toast({ title: 'No Items Left', description: `You don't have any ${itemDefinition.name}.`, variant: 'destructive'}); return;
        }

        try {
            const playerDocRef = doc(db, 'players', authUser.publicKey);
            const playerDocSnap = await getDoc(playerDocRef);
            if (playerDocSnap.exists()) {
                const playerData = playerDocSnap.data();
                const currentRawInventory: any[] = playerData.inventory || [];
                let itemInstanceToRemove: any = null; let itemIndexToRemove = -1;
                for (let i = 0; i < currentRawInventory.length; i++) {
                    const entry = currentRawInventory[i];
                    const entryItemId = typeof entry === 'object' && entry !== null ? entry.id : storeItems.find(si => si.name === entry)?.id;
                    if (entryItemId === itemIdToConsume) { itemInstanceToRemove = entry; itemIndexToRemove = i; break; }
                }
                if (itemInstanceToRemove !== null) {
                    const newInventory = [...currentRawInventory]; newInventory.splice(itemIndexToRemove, 1);
                    await updateDoc(playerDocRef, { inventory: newInventory, lastInteraction: serverTimestamp() });
                    if(activationFunction) activationFunction();
                } else {
                    toast({ title: 'Item Not Found', description: `Could not find ${itemDefinition.name} in inventory.`, variant: 'destructive' });
                }
            }
        } catch (error) {
            console.error("Error consuming item from Firestore:", error);
            toast({ title: 'Failed to Use Item', description: `Could not consume ${itemDefinition?.name || 'item'}. Error: ${error}`, variant: 'destructive' });
        }
    };

    const handleWithdrawUSDT = async () => {
        // Ensure authenticated and wallet is connected and matching for withdrawal
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || !db || playerGameUSDT < MIN_WITHDRAWAL_USDT) {
            toast({ title: "Withdrawal Unavailable", description: `Please connect and authenticate your wallet, and ensure you have at least ${MIN_WITHDRAWAL_USDT} USDT. Your balance: ${playerGameUSDT.toFixed(4)} USDT`, variant: "destructive" }); return;
        }

        let currentProjectId: string | undefined;
        if (db.app && db.app.options) {
            currentProjectId = db.app.options.projectId;
        }
        if (!currentProjectId || (typeof currentProjectId === 'string' && currentProjectId.includes("YOUR_PROJECT_ID"))) {
            toast({ title: 'Firebase Not Configured', description: 'Cannot withdraw, Firebase not set up.', variant: 'destructive' }); return;
        }
        setIsWithdrawing(true);
        toast({ title: "Initiating Withdrawal...", description: "Please wait. This is a simulated process." });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const withdrawalAmount = MIN_WITHDRAWAL_USDT; 
        try {
            const playerDocRef = doc(db, 'players', authUser.publicKey);
            await updateDoc(playerDocRef, {
                gameUSDTBalance: increment(-withdrawalAmount), 
                lastInteraction: serverTimestamp()
            });
            toast({ title: "Withdrawal Processed (Simulated)", description: `${withdrawalAmount} USDT deducted from game balance. Actual on-chain transfer would need a full backend process.`, duration: 7000 });
        } catch (error) {
            console.error("Error updating balance after simulated withdrawal:", error);
            toast({ title: "Withdrawal Error", description: "Could not update game balance after simulated withdrawal.", variant: "destructive" });
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleConsumeProtectionBone = useCallback(async () => {
        // Ensure authenticated and wallet is connected and matching for actions
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || !db || protectionBoneCount <= 0) {
            console.warn("[GameUI] Consume bone called but not authenticated, wallet mismatch, or no bones.");
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet to use items.', variant: 'destructive' });
            return;
        }
        let currentProjectId: string | undefined;
        if (db.app && db.app.options) { currentProjectId = db.app.options.projectId; }
        if (!currentProjectId || (typeof currentProjectId === 'string' && currentProjectId.includes("YOUR_PROJECT_ID"))) {
            toast({ title: 'Firebase Not Configured', description: 'Cannot use bone, Firebase is not set up.', variant: 'destructive' }); return;
        }

        try {
            const playerDocRef = doc(db, 'players', authUser.publicKey);
            const playerDocSnap = await getDoc(playerDocRef);

            if (playerDocSnap.exists()) {
                const playerData = playerDocSnap.data();
                const currentRawInventory: any[] = playerData.inventory || [];
                const protectionBoneDefinition = storeItems.find(item => item.id === '1');
                
                let boneToRemove: any = null;
                const boneIndex = currentRawInventory.findIndex(entry => {
                     const itemId = typeof entry === 'object' && entry !== null && entry.id ? entry.id : (protectionBoneDefinition && protectionBoneDefinition.id === storeItems.find(si => si.name === entry)?.id ? protectionBoneDefinition.id : null);
                     return itemId === '1';
                });

                if (boneIndex !== -1) {
                    boneToRemove = currentRawInventory[boneIndex];
                    const batch = writeBatch(db);
                    batch.update(playerDocRef, { 
                        inventory: arrayRemove(boneToRemove),
                        lastInteraction: serverTimestamp() 
                    });
                    await batch.commit();
                    toast({ title: 'Protected!', description: 'A Protection Bone was used!', variant: 'default' });
                } else {
                     console.warn("[GameUI] Attempted to consume bone, but no bone object found in inventory for arrayRemove. Inventory:", currentRawInventory);
                     toast({ title: 'Inventory Issue', description: 'Protection Bone not found in inventory for removal despite count > 0. Syncing might resolve.', variant: 'destructive' });
                }
            }
        } catch (error) {
            console.error("Error consuming protection bone from Firestore:", error);
            toast({ title: 'Failed to Use Bone', description: `Could not consume Protection Bone. Error: ${error}`, variant: 'destructive' });
        }
    }, [sessionPublicKey, toast, isWalletMismatch, protectionBoneCount, db]);

    const handleEnemyCollisionPenalty = useCallback(async () => {
        // Ensure authenticated and wallet is connected and matching for actions
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUser?.publicKey || !db) {
            toast({ title: 'Action Blocked', description: 'Please connect and authenticate your wallet to apply penalties.', variant: 'destructive' });
            return;
        }
        let currentProjectId: string | undefined;
        if (db.app && db.app.options) { currentProjectId = db.app.options.projectId; }
        if (!currentProjectId || (typeof currentProjectId === 'string' && currentProjectId.includes("YOUR_PROJECT_ID"))) {
             toast({ title: 'Firebase Not Configured', description: 'Cannot apply penalty, Firebase not set up.', variant: 'destructive' }); return;
        }

        try {
            const playerDocRef = doc(db, 'players', authUser.publicKey);
            const currentBalance = playerGameUSDT; // Use state value which is kept in sync by onSnapshot
            const newBalance = Math.max(0, currentBalance - ENEMY_COLLISION_PENALTY_USDT);
            
            if (currentBalance > 0) {
                 await updateDoc(playerDocRef, {
                    gameUSDTBalance: newBalance, // Directly set the new balance
                    lastInteraction: serverTimestamp()
                });
                toast({ title: 'Ouch!', description: `Lost ${ENEMY_COLLISION_PENALTY_USDT.toFixed(4)} USDT from enemy collision!`, variant: 'destructive' });
            } else {
                 toast({ title: 'Close Call!', description: `Enemy hit, but you have no USDT to lose!`, variant: 'default' });
            }

        } catch (error) {
            console.error("Error applying enemy collision penalty in Firestore:", error);
            toast({ title: 'Penalty Error', description: `Could not apply penalty. Error: ${error}`, variant: 'destructive' });
        }
    }, [sessionPublicKey, toast, isWalletMismatch, db, playerGameUSDT]);
    

    return (
        <div className="relative flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
            <main className="flex-grow flex flex-col relative">
                <GameCanvas
                    sessionPublicKey={sessionPublicKey} // Keep sessionPublicKey for Three.js context if needed, but logic should use authUser.publicKey
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
                <div className="absolute top-4 left-4 z-10">
                    <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary"
                                disabled={(isGameEffectivelyPaused && !isMenuOpen) || isWalletMismatch}
                            >
                                <Settings className="h-6 w-6 text-primary" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-full sm:max-w-xs p-0 flex flex-col">
                            <GameMenuSheetContent
                                isWalletMismatch={isWalletMismatch}
                                isAuthenticated={isAuthenticated} // Pass isAuthenticated
                                authUserPublicKey={authUser?.publicKey} // Pass authenticated user's public key
                                sessionPublicKey={sessionPublicKey} // Keep for display if needed
                                adapterPublicKey={adapterPublicKey} // Keep for display if needed
                                isFetchingPlayerUSDT={isFetchingPlayerUSDT}
                                playerGameUSDT={playerGameUSDT}
                                MIN_WITHDRAWAL_USDT={MIN_WITHDRAWAL_USDT}
                                isWithdrawing={isWithdrawing}
                                onWithdrawUSDT={handleWithdrawUSDT}
                                dbAppOptionsProjectId={db?.app?.options?.projectId}
                            />
                        </SheetContent>
                    </Sheet>
                </div>

                <div className="absolute bottom-6 right-6 z-10 flex flex-col space-y-3">
                    <Sheet open={isStoreOpen} onOpenChange={setIsStoreOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline" size="icon" className="rounded-full h-14 w-14 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary"
                                disabled={(isGameEffectivelyPaused && !isStoreOpen) || isWalletMismatch}
                            >
                                <ShoppingCart className="h-7 w-7 text-primary" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                            <InGameStore 
                                isAuthenticated={isAuthenticated}
                                authUserPublicKey={authUser?.publicKey}
                                isWalletConnectedAndMatching={isWalletConnectedAndMatching}
                            />
                        </SheetContent>
                    </Sheet>
                    
                    <Sheet open={isInventoryOpen} onOpenChange={setIsInventoryOpen}>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline" size="icon" className="rounded-full h-14 w-14 shadow-lg bg-background/80 hover:bg-accent/90 backdrop-blur-sm border-primary"
                                disabled={(isGameEffectivelyPaused && !isInventoryOpen) || isWalletMismatch}
                            >
                                <Backpack className="h-7 w-7 text-primary" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                           <PlayerInventory 
                                isAuthenticated={isAuthenticated}
                                authUserPublicKey={authUser?.publicKey}
                                isWalletConnectedAndMatching={isWalletConnectedAndMatching}
                                speedyPawsTreatCount={speedyPawsTreatCount}
                                guardianShieldCount={guardianShieldCount}
                                protectionBoneCount={protectionBoneCount}
                                coinMagnetTreatCount={coinMagnetTreatCount}
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
