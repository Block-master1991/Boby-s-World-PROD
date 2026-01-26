import { useToast } from '@/hooks/use-toast';
import { ENEMY_COLLISION_PENALTY_USDT } from '@/lib/constants';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBatchedUpdates } from './useBatchedUpdates';
import { getBatchTimestamp } from './useGameData';

interface OptimisticUpdate { id: string; type: 'coin' | 'penalty' | 'withdraw'; amount?: number; timestamp: number; status: 'pending' | 'failed'; }
interface PenaltyQueueItem { amount: number; id: string; }
interface UseGameEconomyProps { 
    isAuthenticated: boolean; 
    isWalletConnectedAndMatching: boolean; 
    authUserPublicKey: string | undefined; 
    playerGameUSDT: number; 
    fetchPlayerData: () => Promise<void>;
    updateBalanceLocally: (usd: number, syncId?: string) => void;
    lastSyncId: string;
}
interface EconomyState { optimisticUpdates: OptimisticUpdate[]; unbatchedCoin: number; unbatchedPenalty: number; sessionCollectedUSDT: number; isWithdrawing: boolean; remainingCoins: number; }

const MIN_WITHDRAWAL_USDT = 0.5;
const COIN_COUNT_FOR_GAME_LOGIC = 1000;
const USDT_PER_COIN = 0.001;

type ApiFetch = (url: string, options?: RequestInit) => Promise<Response>;
type SetEconomyState = (val: EconomyState | ((prev: EconomyState) => EconomyState)) => void;

// --- Batch Processing Hooks ---
function useCoinBatchProcessor(apiFetch: ApiFetch, updateBalanceLocally: (usd: number, syncId?: string) => void, setEconomyState: SetEconomyState) {
    return useCallback(async (amounts: number[]) => {
        const total = amounts.reduce((s, v) => s + v, 0); 
        const id = `batch-${Date.now()}`;
        
        setEconomyState((p: EconomyState) => ({
            ...p,
            unbatchedCoin: Math.max(0, p.unbatchedCoin - total),
            optimisticUpdates: [...p.optimisticUpdates, { id, type: 'coin', amount: total, timestamp: Date.now(), status: 'pending' }]
        }));
        
        logger.log(`[Economy] Starting coin sync: ${total} USDT (Batch: ${id})`);
        try { 
            const res = await apiFetch('/api/game/addCoin', { method: 'POST', body: JSON.stringify({ amount: total, batchId: id }) }); 
            if (res.ok) { 
                const data = await res.json();
                logger.log(`[Economy] Coin sync success. New Balance: ${data.newBalance} USDT (Batch: ${id})`);
                if (typeof data.newBalance === 'number') updateBalanceLocally(data.newBalance, id);
                // We don't remove optimistic update here; useEffect handles it via lastSyncId to avoid flicker
            } else { throw new Error('Server rejected'); }
        } catch (e) {
            logger.error(`[Economy] Coin sync failed, rolling back: ${total} USDT (Batch: ${id})`, e as Error);
            setEconomyState((p: EconomyState) => ({ ...p, unbatchedCoin: p.unbatchedCoin + total, optimisticUpdates: p.optimisticUpdates.filter(u => u.id !== id) }));
        }
    }, [apiFetch, updateBalanceLocally, setEconomyState]);
}

function usePenaltyBatchProcessor(apiFetch: ApiFetch, updateBalanceLocally: (usd: number, syncId?: string) => void, setEconomyState: SetEconomyState) {
    return useCallback(async (items: PenaltyQueueItem[]) => {
        const total = items.reduce((s, i) => s + i.amount, 0);
        const batchId = `batch-penalty-${Date.now()}`;
        
        setEconomyState((p: EconomyState) => ({
            ...p,
            unbatchedPenalty: Math.max(0, p.unbatchedPenalty - total),
            optimisticUpdates: [...p.optimisticUpdates, { id: batchId, type: 'penalty', amount: total, timestamp: Date.now(), status: 'pending' }]
        }));
 
        logger.log(`[Economy] Starting penalty sync: ${total} USDT (Batch: ${batchId})`);
        try { 
            const res = await apiFetch('/api/game/applyPenalty', { method: 'POST', body: JSON.stringify({ amount: total, batchId: batchId }) }); 
            if (res.ok) { 
                const data = await res.json();
                logger.log(`[Economy] Penalty sync success. New Balance: ${data.newBalance} USDT (Batch: ${batchId})`);
                if (typeof data.newBalance === 'number') updateBalanceLocally(data.newBalance, batchId);
                // useEffect handles cleanup
            } else { throw new Error('Server rejected'); }
        } catch (e) { 
            logger.error(`[Economy] Penalty sync failed, rolling back: ${total} USDT (Batch: ${batchId})`, e as Error);
            setEconomyState((p: EconomyState) => ({ ...p, unbatchedPenalty: p.unbatchedPenalty + total, optimisticUpdates: p.optimisticUpdates.filter(u => u.id !== batchId) }));
        }
    }, [apiFetch, updateBalanceLocally, setEconomyState]);
}

function calculateDisplayedBalance(playerGameUSDT: number, state: EconomyState, lastSyncId: string) {
    const syncTs = getBatchTimestamp(lastSyncId);

    const pendingCoins = state.optimisticUpdates
        .filter(u => u.type === 'coin' && u.status === 'pending' && getBatchTimestamp(u.id) > syncTs)
        .reduce((s, u) => s + (u.amount || 0), 0);
        
    const pendingPenalties = state.optimisticUpdates
        .filter(u => u.type === 'penalty' && u.status === 'pending' && getBatchTimestamp(u.id) > syncTs)
        .reduce((s, u) => s + (u.amount || 0), 0);

    const pendingWithdrawals = state.optimisticUpdates
        .filter(u => u.type === 'withdraw' && u.status === 'pending') // Withdrawals don't use batch timestamps yet in the same way
        .reduce((s, u) => s + (u.amount || 0), 0);

    const balance = playerGameUSDT + state.unbatchedCoin - state.unbatchedPenalty + pendingCoins - pendingPenalties - pendingWithdrawals;
    return Math.max(0, Number(balance.toFixed(6)));
}

interface WithdrawalHandlerProps {
    isAuthenticated: boolean;
    isWalletConnectedAndMatching: boolean;
    authUserPublicKey: string | undefined;
    displayedBalance: number;
    apiFetch: ApiFetch;
    fetchPlayerData: () => Promise<void>;
    setEconomyState: SetEconomyState;
    toast: (props: { title?: string; description?: string; variant?: "default" | "destructive" }) => void;
}

function useWithdrawalHandler({
    isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, 
    displayedBalance, apiFetch, fetchPlayerData, 
    setEconomyState, toast
}: WithdrawalHandlerProps) {
    return useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey || displayedBalance < MIN_WITHDRAWAL_USDT) { 
            toast({ title: "Unavailable", description: `Need ${MIN_WITHDRAWAL_USDT}.`, variant: "destructive" }); return; 
        }
        const id = `withdraw-${Date.now()}`;
        setEconomyState((p: EconomyState) => ({ ...p, isWithdrawing: true, optimisticUpdates: [...p.optimisticUpdates, { id, type: 'withdraw', amount: MIN_WITHDRAWAL_USDT, timestamp: Date.now(), status: 'pending' }] }));
        
        try { 
            const res = await apiFetch('/api/game/withdrawUSDT', { method: 'POST', body: JSON.stringify({ amount: MIN_WITHDRAWAL_USDT }) }); 
            if (res.ok) { 
                await fetchPlayerData(); 
                setEconomyState((p: EconomyState) => ({ ...p, optimisticUpdates: p.optimisticUpdates.filter(u => u.id !== id) })); 
                toast({ title: "Success" }); 
            } 
            else { 
                setEconomyState((p: EconomyState) => ({ ...p, optimisticUpdates: p.optimisticUpdates.map(u => u.id === id ? { ...u, status: 'failed' } : u) })); 
                toast({ title: "Failed", variant: "destructive" }); 
            } 
        } catch { 
            setEconomyState((p: EconomyState) => ({ ...p, optimisticUpdates: p.optimisticUpdates.map(u => u.id === id ? { ...u, status: 'failed' } : u) })); 
            toast({ title: "Error", variant: "destructive" }); 
        } finally { setEconomyState((p: EconomyState) => ({ ...p, isWithdrawing: false })); }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, displayedBalance, toast, fetchPlayerData, apiFetch, setEconomyState]);
}

// --- Main Hook ---
export const useGameEconomy = ({ isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, playerGameUSDT, fetchPlayerData, updateBalanceLocally, lastSyncId }: UseGameEconomyProps) => {
    const { toast } = useToast(); 
    const { apiFetch } = useApiFetch();
    
    const [economyState, setEconomyState] = useState<EconomyState>({
        optimisticUpdates: [],
        unbatchedCoin: 0,
        unbatchedPenalty: 0,
        sessionCollectedUSDT: 0,
        isWithdrawing: false,
        remainingCoins: COIN_COUNT_FOR_GAME_LOGIC
    });
    // Sync Cleanup Effect: Remove optimistic updates that have been confirmed by lastSyncId (timestamp check)
    useEffect(() => {
        if (lastSyncId) {
            const syncTs = getBatchTimestamp(lastSyncId);
            setEconomyState((p: EconomyState) => ({
                ...p,
                optimisticUpdates: p.optimisticUpdates.filter(u => getBatchTimestamp(u.id) > syncTs)
            }));
        }
    }, [lastSyncId]);

    // حساب الرصيد المعروض: الرصيد من الخادم + العملات غير المرسلة - العقوبات غير المرسلة + العملات المعلقة
    const displayedPlayerGameUSDT = useMemo(() => calculateDisplayedBalance(playerGameUSDT, economyState, lastSyncId), [playerGameUSDT, economyState, lastSyncId]);
 
    const processCoinBatch = useCoinBatchProcessor(apiFetch as ApiFetch, updateBalanceLocally, setEconomyState);
    const processPenaltyBatch = usePenaltyBatchProcessor(apiFetch as ApiFetch, updateBalanceLocally, setEconomyState);
 
    const { addUpdate: batchAddCoin } = useBatchedUpdates<number>(processCoinBatch, 3000, 'offline_coin_queue_v1');
    const { addUpdate: batchApplyPenalty } = useBatchedUpdates<PenaltyQueueItem>(processPenaltyBatch, 3000, 'offline_penalty_queue_v1');
 
    const handleCoinCollected = useCallback(() => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey) { toast({ title: 'Blocked', description: 'Connect wallet.', variant: 'destructive' }); return; }
        setEconomyState((p: EconomyState) => ({ 
            ...p, 
            unbatchedCoin: Number((p.unbatchedCoin + USDT_PER_COIN).toFixed(6)), 
            sessionCollectedUSDT: Number((p.sessionCollectedUSDT + USDT_PER_COIN).toFixed(6)) 
        }));
        batchAddCoin(USDT_PER_COIN);
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, toast, batchAddCoin]);
 
    const handleEnemyCollisionPenalty = useCallback(() => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey) { toast({ title: 'Blocked', description: 'Auth required.', variant: 'destructive' }); return; }
        setEconomyState((p: EconomyState) => ({ 
            ...p, 
            unbatchedPenalty: Number((p.unbatchedPenalty + ENEMY_COLLISION_PENALTY_USDT).toFixed(6)) 
        }));
        batchApplyPenalty({ amount: ENEMY_COLLISION_PENALTY_USDT, id: `immed-${Date.now()}` });
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, toast, batchApplyPenalty]);
 
    const handleWithdrawUSDT = useWithdrawalHandler({
        isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, 
        displayedBalance: displayedPlayerGameUSDT, apiFetch: apiFetch as ApiFetch, 
        fetchPlayerData, setEconomyState, toast
    });

    return { 
        sessionCollectedUSDT: economyState.sessionCollectedUSDT, 
        remainingCoinsOnMap: economyState.remainingCoins, 
        displayedPlayerGameUSDT, 
        isWithdrawing: economyState.isWithdrawing, 
        handleCoinCollected, 
        handleEnemyCollisionPenalty, 
        handleWithdrawUSDT, 
        handleRemainingCoinsUpdate: (v: number) => setEconomyState((p: EconomyState) => ({ ...p, remainingCoins: v })), 
        MIN_WITHDRAWAL_USDT, 
        COIN_COUNT_FOR_GAME_LOGIC 
    };
};
