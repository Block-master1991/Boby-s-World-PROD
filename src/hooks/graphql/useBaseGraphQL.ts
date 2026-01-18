import { getGraphQLClient } from '@/lib/graphql-client';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphQLHookResult } from './types';

// Cache for GraphQL results to prevent duplicate requests
const graphqlCache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();
const pendingRequests = new Map<string, Promise<unknown>>();
const DEFAULT_CACHE_TTL = 30000; // 30 seconds

const getCachedData = <T>(key: string, ttl: number): T | null => {
    const cached = graphqlCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < ttl) {
        logger.log(`[useGraphQL] Using cached result for: ${key.substring(0, 50)}...`);
        return cached.data as T;
    }
    return null;
};

const executeQuery = async <T>(query: string, variables: object, key: string, ttl: number): Promise<T> => {
    const client = getGraphQLClient();
    const result = await client.query(query, variables, { requestPolicy: 'network-only' }).toPromise();
    
    if (result.error) throw new Error(result.error.message);

    graphqlCache.set(key, { data: result.data, timestamp: Date.now(), ttl });
    setTimeout(() => graphqlCache.delete(key), ttl);
    return result.data as T;
};

export const useBaseGraphQL = <T = unknown>(
    query: string,
    options?: { variables?: unknown; skip?: boolean; cacheTTL?: number; }
): GraphQLHookResult<T> => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cacheKey = useMemo(() => `${query.trim()}-${JSON.stringify(options?.variables || {})}`, [query, options?.variables]);
    const cacheTTL = options?.cacheTTL || DEFAULT_CACHE_TTL;

    const execute = useCallback(async (variables?: unknown) => {
        const cached = getCachedData<T>(cacheKey, cacheTTL);
        if (cached) { setData(cached); setError(null); return cached; }

        if (pendingRequests.has(cacheKey)) {
            try {
                const res = await pendingRequests.get(cacheKey);
                setData(res as T); setError(null); return res as T;
            } catch { /* Retry if pending failed */ }
        }

        setLoading(true); setError(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const finalVars = (variables || options?.variables || {}) as any;
        const req = executeQuery<T>(query, finalVars, cacheKey, cacheTTL)
            .then(res => { setData(res); return res; })
            .catch(err => {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                setError(msg); logger.error('[useGraphQL] Query failed:', msg);
                throw err;
            })
            .finally(() => { setLoading(false); pendingRequests.delete(cacheKey); });

        pendingRequests.set(cacheKey, req);
        try { return await req; } catch { return null; }
    }, [query, options?.variables, cacheKey, cacheTTL]);

    useEffect(() => { if (!options?.skip) execute(); }, [options?.skip, execute]);

    return { data, loading, error, execute };
};

export const useBaseMutation = <T = unknown>(mutation: string) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (variables?: unknown): Promise<T | null> => {
        setLoading(true); setError(null);
        try {
            const client = getGraphQLClient();
            const result = await client.mutation(mutation, (variables || {}) as object, {}).toPromise();
            if (result.error) throw new Error(result.error.message);
            return result.data;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setError(msg); logger.error('[useGraphQLMutation] Mutation failed:', msg);
            return null;
        } finally { setLoading(false); }
    }, [mutation]);

    return { loading, error, execute };
};
