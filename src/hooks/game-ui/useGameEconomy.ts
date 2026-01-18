import { useToast } from '@/hooks/use-toast';
import { ENEMY_COLLISION_PENALTY_USDT } from '@/lib/constants';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback, useMemo, useState } from 'react';
import { useBatchedUpdates } from './useBatchedUpdates';

interface OptimisticUpdate { id: string; type: 'coin' | 'penalty' | 'withdraw'; amount?: number; timestamp: number; status: 'pending' | 'failed'; }
interface PenaltyQueueItem { amount: number; id: string; }
interface UseGameEconomyProps { isAuthenticated: boolean; isWalletConnectedAndMatching: boolean; authUserPublicKey: string | undefined; playerGameUSDT: number; fetchPlayerData: () => Promise<void>; }

const MIN_WITHDRAWAL_USDT = 0.5;
const COIN_COUNT_FOR_GAME_LOGIC = 1000;
const USDT_PER_COIN = 0.001;

type ApiFetch = (url: string, options?: RequestInit) => Promise<Response>;

function useEconomyBatches(
    apiFetch: ApiFetch,
    fetchPlayerData: () => Promise<void>,
    setOptimisticUpdates: React.Dispatch<React.SetStateAction<OptimisticUpdate[]>>
) {
    const processCoinBatch = useCallback(async (amounts: number[]) => {
        const total = amounts.reduce((s, v) => s + v, 0); const id = `batch-${Date.now()}`;
        setOptimisticUpdates(p => [...p, { id, type: 'coin', amount: total, timestamp: Date.now(), status: 'pending' }]);
        try { const res = await apiFetch('/api/game/addCoin', { method: 'POST', body: JSON.stringify({ amount: total }) }); if (res.ok) { await fetchPlayerData(); setOptimisticUpdates(p => p.filter(u => u.id !== id)); } else throw new Error(); } catch { setOptimisticUpdates(p => p.map(u => u.id === id ? { ...u, status: 'failed' } : u)); }
    }, [apiFetch, fetchPlayerData, setOptimisticUpdates]);

    const processPenaltyBatch = useCallback(async (items: PenaltyQueueItem[]) => {
        const total = items.reduce((s, i) => s + i.amount, 0);
        try { const res = await apiFetch('/api/game/applyPenalty', { method: 'POST', body: JSON.stringify({ amount: total }) }); if (res.ok) { await fetchPlayerData(); const ids = new Set(items.map(i => i.id)); setOptimisticUpdates(p => p.filter(u => !ids.has(u.id))); } else throw new Error(); } catch (e) { logger.error(`Penalty error: ${String(e)}`); throw e; }
    }, [apiFetch, fetchPlayerData, setOptimisticUpdates]);
    return { processCoinBatch, processPenaltyBatch };
}

export const useGameEconomy = ({ isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, playerGameUSDT, fetchPlayerData }: UseGameEconomyProps) => {
    const { toast } = useToast(); const { apiFetch } = useApiFetch();
    const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([]);
    const [uiState, setUiState] = useState({ sessionCollectedUSDT: 0, isWithdrawing: false, remainingCoins: COIN_COUNT_FOR_GAME_LOGIC });

    const displayedPlayerGameUSDT = useMemo(() => {
        let current = playerGameUSDT; optimisticUpdates.forEach(u => { if (u.status !== 'pending') return; if (u.type === 'coin') current += (u.amount || 0); else current -= (u.amount || 0); }); return current;
    }, [playerGameUSDT, optimisticUpdates]);

    const { processCoinBatch, processPenaltyBatch } = useEconomyBatches(apiFetch as ApiFetch, fetchPlayerData, setOptimisticUpdates);
    const { addUpdate: batchAddCoin } = useBatchedUpdates<number>(processCoinBatch, 300, 'offline_coin_queue_v1');
    const { addUpdate: batchApplyPenalty } = useBatchedUpdates<PenaltyQueueItem>(processPenaltyBatch, 300, 'offline_penalty_queue_v1');

    const handleCoinCollected = useCallback(() => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey) { toast({ title: 'Blocked', description: 'Connect wallet.', variant: 'destructive' }); return; }
        setUiState(p => ({ ...p, sessionCollectedUSDT: p.sessionCollectedUSDT + USDT_PER_COIN })); batchAddCoin(USDT_PER_COIN);
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, toast, batchAddCoin]);

    const handleEnemyCollisionPenalty = useCallback(() => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey) { toast({ title: 'Blocked', description: 'Auth required.', variant: 'destructive' }); return; }
        const id = `penalty-${Date.now()}`; setOptimisticUpdates(p => [...p, { id, type: 'penalty', amount: ENEMY_COLLISION_PENALTY_USDT, timestamp: Date.now(), status: 'pending' }]); batchApplyPenalty({ amount: ENEMY_COLLISION_PENALTY_USDT, id });
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, toast, batchApplyPenalty]);

    const handleWithdrawUSDT = useCallback(async () => {
        if (!isAuthenticated || !isWalletConnectedAndMatching || !authUserPublicKey || displayedPlayerGameUSDT < MIN_WITHDRAWAL_USDT) { toast({ title: "Unavailable", description: `Need ${MIN_WITHDRAWAL_USDT}.`, variant: "destructive" }); return; }
        setUiState(p => ({ ...p, isWithdrawing: true })); const id = Date.now().toString();
        setOptimisticUpdates(p => [...p, { id, type: 'withdraw', amount: MIN_WITHDRAWAL_USDT, timestamp: Date.now(), status: 'pending' }]);
        try { const res = await apiFetch('/api/game/withdrawUSDT', { method: 'POST', body: JSON.stringify({ amount: MIN_WITHDRAWAL_USDT }) }); if (res.ok) { await fetchPlayerData(); setOptimisticUpdates(p => p.filter(u => u.id !== id)); toast({ title: "Success" }); } else { setOptimisticUpdates(p => p.map(u => u.id === id ? { ...u, status: 'failed' } : u)); toast({ title: "Failed", variant: "destructive" }); } } catch { setOptimisticUpdates(p => p.map(u => u.id === id ? { ...u, status: 'failed' } : u)); toast({ title: "Error", variant: "destructive" }); } finally { setUiState(p => ({ ...p, isWithdrawing: false })); }
    }, [isAuthenticated, isWalletConnectedAndMatching, authUserPublicKey, displayedPlayerGameUSDT, toast, fetchPlayerData, apiFetch]);

    return { sessionCollectedUSDT: uiState.sessionCollectedUSDT, remainingCoinsOnMap: uiState.remainingCoins, displayedPlayerGameUSDT, isWithdrawing: uiState.isWithdrawing, handleCoinCollected, handleEnemyCollisionPenalty, handleWithdrawUSDT, handleRemainingCoinsUpdate: (v: number) => setUiState(p => ({ ...p, remainingCoins: v })), MIN_WITHDRAWAL_USDT, COIN_COUNT_FOR_GAME_LOGIC };
};
