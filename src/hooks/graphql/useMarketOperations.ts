import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';
import type { MarketData, PriceUpdate, WithdrawResponse } from './types';

let globalMarketDataCache: { marketData: MarketData } | null = null;
let lastMarketDataFetchTime = 0;
const MARKET_DATA_CACHE_TTL = 60000;

export const useMarketData = () => {
    const { apiFetch } = useApiFetch();
    const [state, setState] = useState<{ data: { marketData: MarketData } | null, loading: boolean, error: string | null }>({
        data: globalMarketDataCache, loading: false, error: null
    });

    const execute = useCallback(async (force = false) => {
        const now = Date.now();
        if (!force && globalMarketDataCache && (now - lastMarketDataFetchTime < MARKET_DATA_CACHE_TTL)) {
            setState(s => ({ ...s, data: globalMarketDataCache, error: null }));
            return;
        }
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const res = await apiFetch('/api/graphql', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `query GetMarketData { marketData { bobyPrice volume24h priceChange24h lastUpdated } }` })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);

            globalMarketDataCache = json.data;
            lastMarketDataFetchTime = now;
            setState(s => ({ ...s, data: json.data, loading: false }));
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            logger.error('[useMarketData] Error:', msg);
            setState(s => ({ ...s, error: msg, loading: false }));
        }
    }, [apiFetch]);

    useEffect(() => { execute(); }, [execute]);
    return { ...state, execute };
};

export const useBobyPriceUpdates = () => {
    const { apiFetch } = useApiFetch();
    const [state, setState] = useState<{ data: PriceUpdate | null, error: string | null }>({ data: null, error: null });

    useEffect(() => {
        let active = true;
        const poll = async () => {
            try {
                const res = await apiFetch('/api/graphql', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: `subscription BobyPriceUpdates { bobyPriceUpdates { price changePercent timestamp } }` })
                });
                if (active && res.ok) {
                    const json = await res.json();
                    if (json.data?.bobyPriceUpdates) setState(s => ({ ...s, data: json.data.bobyPriceUpdates, error: null }));
                }
            } catch (err) {
                if (active) logger.error('[useBobyPriceUpdates] Error:', err);
            }
        };
        const id = setInterval(poll, 30000);
        poll();
        return () => { active = false; clearInterval(id); };
    }, [apiFetch]);

    return state;
};

export const useWithdrawUSDT = () => {
    const { apiFetch } = useApiFetch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const withdrawUSDT = useCallback(async (userId: string, amount: number): Promise<WithdrawResponse> => {
        setLoading(true); setError(null);
        try {
            const res = await apiFetch('/api/graphql', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `mutation WithdrawUSDT($userId: ID!, $amount: Float!) { withdrawUSDT(userId: $userId, amount: $amount) { success withdrawalId amount error } }`,
                    variables: { userId, amount }
                })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);
            return json.data?.withdrawUSDT;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg); logger.error('[useWithdrawUSDT] Error:', msg);
            return { success: false, error: msg };
        } finally { setLoading(false); }
    }, [apiFetch]);

    return { loading, error, withdrawUSDT };
};
