import { useToast } from '@/hooks/use-toast';
import { useFetchPlayerData } from '@/hooks/useGraphQL';
import { logger } from '@/utils/logger';
import { useCallback, useState } from 'react';

interface InventoryItem { id: string; quantity: number; }

const parseIds = (inv: InventoryItem[]) => {
    let [b, s, sp, m] = [0, 0, 0, 0];
    inv.forEach(i => { const q = i.quantity || 1;
        if(i.id==='1')b+=q; else if(i.id==='2')s+=q; else if(i.id==='3')sp+=q; else if(i.id==='4')m+=q; });
    return { b, s, sp, m };
};

export const useGameData = (props: { sessionPublicKey?: string | undefined }) => {
    const { sessionPublicKey } = props;
    const { toast } = useToast();
    const { fetchData } = useFetchPlayerData();

    const [state, setState] = useState({ usd: 0, b: 0, s: 0, sp: 0, m: 0 });
    const [loading, setLoading] = useState({ fetch: true, store: false, inv: false, wallet: false });

    const fetchPlayerData = useCallback(async (loadUi = false) => {
        if (!sessionPublicKey) { setLoading(p=>({...p, fetch:false})); return; }
        if (loadUi) setLoading({ fetch: true, store: true, inv: true, wallet: true }); else setLoading(p=>({...p, fetch: true}));

        try {
            const res = await fetchData(sessionPublicKey);
            if (res?.success && res.playerData) {
                const p = parseIds((res.playerData.inventory || []) as InventoryItem[]);
                setState({ usd: res.playerData.coins || 0, b: p.b, s: p.s, sp: p.sp, m: p.m });
            } else logger.error("Fetch error:", res?.error);
        } catch { toast({ title: 'Error', description: `Fetch failed.`, variant: 'destructive' }); setState(p=>({...p, usd:0})); }
        finally { setLoading({ fetch: false, store: false, inv: false, wallet: false }); }
    }, [sessionPublicKey, toast, fetchData]);

    return {
        playerGameUSDT: state.usd, fetchPlayerData, isFetchingPlayerUSDT: loading.fetch,
        protectionBottleCount: state.b, guardianShieldCount: state.s, speedyPawsTreatCount: state.sp, coinMagnetTreatCount: state.m,
        isStoreLoading: loading.store, isInventoryLoading: loading.inv, isWalletLoading: loading.wallet
    };
};
