import { getGraphQLClient } from '@/lib/graphql-client';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';
import type { ConsumableItemResponse, LoginResponse } from './types';

const handleMutationError = (err: unknown, context: string): string => {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[${context}] Error:`, msg);
    return msg;
};

export const useAuthMutations = () => {
    const generateNonce = useCallback(async (publicKey: string) => {
        const result = await getGraphQLClient().query(`
            mutation GenerateAuthNonce($publicKey: String!) { generateAuthNonce(publicKey: $publicKey) { success nonce error } }
        `, { publicKey }).toPromise();
        if (result.error) throw new Error(result.error.message);
        return result.data?.generateAuthNonce;
    }, []);

    const login = useCallback(async (input: { publicKey: string; signature: string; nonce: string }): Promise<LoginResponse> => {
        const result = await getGraphQLClient().mutation(`
            mutation Login($input: LoginInput!) { login(input: $input) { success message publicKey error } }
        `, { input }).toPromise();
        if (result.error) throw new Error(result.error.message);
        return result.data?.login;
    }, []);

    return { generateNonce, login };
};

export const useConsumableItem = () => {
    const [state, setState] = useState({ loading: false, error: null as string | null });

    const useItem = useCallback(async (userId: string, itemId: string, quantity: number): Promise<ConsumableItemResponse> => {
        setState({ loading: true, error: null });
        try {
            const result = await getGraphQLClient().mutation(`
                mutation UseConsumableItem($userId: ID!, $itemId: String!, $quantity: Int!) {
                    useConsumableItem(userId: $userId, itemId: $itemId, quantity: $quantity) { success message remainingCount error }
                }
            `, { userId, itemId, quantity }).toPromise();
            if (result.error) throw new Error(result.error.message);
            return result.data?.useConsumableItem;
        } catch (err) {
            const msg = handleMutationError(err, 'useConsumableItem');
            setState({ loading: false, error: msg });
            return { success: false, message: '', error: msg };
        } finally { setState(s => ({ ...s, loading: false })); }
    }, []);

    return { ...state, useItem };
};

export const useGameEvents = (userId: string) => {
    const { apiFetch } = useApiFetch();
    const [state, setState] = useState<{ data: unknown, error: string | null }>({ data: null, error: null });

    useEffect(() => {
        if (!userId) return;
        let active = true;
        const poll = async () => {
            try {
                const res = await apiFetch('/api/graphql', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: `subscription GameEvents($userId: ID!) { gameEvents(userId: $userId) { eventType data timestamp } }`,
                        variables: { userId }
                    })
                });
                if (active && res.ok) {
                    const json = await res.json();
                    if (json.data?.gameEvents) setState({ data: json.data.gameEvents, error: null });
                }
            } catch (err) {
                if (active) logger.error('[useGameEvents] Error:', err);
            }
        };
        const id = setInterval(poll, 30000);
        poll();
        return () => { active = false; clearInterval(id); };
    }, [userId, apiFetch]);

    return state;
};
