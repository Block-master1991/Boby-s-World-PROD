// GraphQL Client with URQL for Efficient API Communication
// Refactored for better maintainability and type safety

import { logger } from '@/utils/logger';
import type { Client } from 'urql';
import { cacheExchange, createClient, fetchExchange } from 'urql';

// --- Types ---
interface GraphQLErrorExtensions { code?: string; networkError?: boolean; [key: string]: unknown; }
interface GraphQLResponseError { message: string; extensions?: GraphQLErrorExtensions | undefined; }
interface GraphQLResponse<T = unknown> { data?: T; errors?: GraphQLResponseError[]; extensions?: Record<string, unknown>; }
type Variables = Record<string, unknown>;
type RequestPolicy = 'cache-first' | 'cache-only' | 'network-only' | 'cache-and-network';

export class GraphQLError extends Error {
    public code: string | undefined;
    public extensions: GraphQLErrorExtensions | undefined;
    constructor(message: string, extensions?: GraphQLErrorExtensions) {
        super(message); this.name = 'GraphQLError'; this.code = extensions?.code; this.extensions = extensions;
    }
}

// --- Config ---
const getGraphQLConfig = () => ({ url: '/api/graphql', timeout: 30000 });

// --- Auth Helpers ---
const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
        const cookies = document.cookie.split(';');
        const accessTokenCookie = cookies.find(c => c.trim().startsWith('accessToken='));
        if (accessTokenCookie) {
            const [, token] = accessTokenCookie.split('=');
            headers['Authorization'] = `Bearer ${token}`;
        }
    }
    return headers;
};

const tryRefreshToken = async (authHeaders: Record<string, string>): Promise<boolean> => {
    try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            if (data.accessToken) { authHeaders['Authorization'] = `Bearer ${data.accessToken}`; return true; }
        }
    } catch (e) { logger.warn('[GraphQL] Token refresh failed:', e); }
    return false;
};

// --- Custom Fetch ---
const createAuthenticatedFetch = (timeout: number): typeof fetch => async (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const authHeaders = getAuthHeaders();

    try {
        const response = await fetch(input, { ...init, headers: { ...authHeaders, ...init?.headers } });

        if (response.status === 401 && typeof window !== 'undefined') {
            const refreshed = await tryRefreshToken(authHeaders);
            if (refreshed) return fetch(input, { ...init, headers: { ...authHeaders, ...init?.headers } });
        }
        return response;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            logger.error('[GraphQL] Request timed out:', input);
            throw new Error('Request timed out. Please check your connection.');
        }
        throw error;
    } finally { clearTimeout(timeoutId); }
};

// --- Client Factory ---
const createGraphQLClient = (): Client => {
    const config = getGraphQLConfig();
    return createClient({
        url: config.url,
        exchanges: [cacheExchange, fetchExchange],
        fetch: createAuthenticatedFetch(config.timeout),
    });
};

let graphqlClient: Client | null = null;
export const getGraphQLClient = (): Client => { if (!graphqlClient) graphqlClient = createGraphQLClient(); return graphqlClient; };

// --- Query/Mutation Wrappers ---
const buildErrorResponse = <T>(errors: GraphQLError[], hasNetworkError: boolean): GraphQLResponse<T> => ({
    errors,
    ...(hasNetworkError ? { extensions: { networkError: true } } : {}),
});

export const graphqlQuery = async <T = unknown>(
    query: string, variables?: Variables, options?: { requestPolicy?: RequestPolicy; context?: Record<string, unknown>; }
): Promise<GraphQLResponse<T>> => {
    const client = getGraphQLClient();
    try {
        const result = await client.query(query, variables || {}, { requestPolicy: options?.requestPolicy || 'cache-first', ...options?.context }).toPromise();
        if (result.error) {
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions as GraphQLErrorExtensions)) || [];
            return buildErrorResponse<T>(errors, !!result.error.networkError);
        }
        return { data: result.data as T, extensions: result.extensions as Record<string, unknown> };
    } catch (error) {
        logger.error('[GraphQL] Query failed:', error);
        return { errors: [new GraphQLError(error instanceof Error ? error.message : 'Unknown error')] };
    }
};

export const graphqlMutation = async <T = unknown>(
    mutation: string, variables?: Variables, options?: { context?: Record<string, unknown>; }
): Promise<GraphQLResponse<T>> => {
    const client = getGraphQLClient();
    try {
        const result = await client.mutation(mutation, variables || {}, { ...options?.context }).toPromise();
        if (result.error) {
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions as GraphQLErrorExtensions)) || [];
            return buildErrorResponse<T>(errors, !!result.error.networkError);
        }
        return { data: result.data as T, extensions: result.extensions as Record<string, unknown> };
    } catch (error) {
        logger.error('[GraphQL] Mutation failed:', error);
        return { errors: [new GraphQLError(error instanceof Error ? error.message : 'Unknown error')] };
    }
};

export const graphqlSubscription = (subscription: string, variables?: Variables, callback?: (result: GraphQLResponse) => void) => {
    const client = getGraphQLClient();
    const sub = client.subscription(subscription, variables || {});
    return sub.subscribe((result) => {
        if (result.error) {
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions as GraphQLErrorExtensions)) || [];
            callback?.(buildErrorResponse(errors, !!result.error.networkError));
        } else {
            callback?.({ data: result.data, extensions: result.extensions as Record<string, unknown> });
        }
    });
};

// --- Utilities ---
export const graphqlUtils = {
    clearCache: () => { logger.log('[GraphQL] Cache clearing not implemented'); },
    getCacheStats: () => ({ operations: 0, cacheSize: 0, hitRate: 0 }),
    healthCheck: async (): Promise<boolean> => {
        try { const r = await graphqlQuery(`query HealthCheck { health }`); return !r.errors && (r.data as { health?: string })?.health === 'OK'; } catch { return false; }
    },
};

// --- Predefined Queries (required by other modules) ---
export const GAME_QUERIES = {
    GET_USER_GAME_DATA: `query GetUserGameData($userId: ID!) { user(id: $userId) { id username gameStats { level coins experience achievements { id name unlockedAt } } inventory { id itemType quantity rarity } } }`,
    GET_GAME_WORLD: `query GetGameWorld($chunkX: Int!, $chunkZ: Int!, $radius: Int) { gameWorld(chunkX: $chunkX, chunkZ: $chunkZ, radius: $radius) { chunks { x z terrainData entities { id type position { x y z } } } } }`,
    GET_MARKET_DATA: `query GetMarketData { marketData { bobyPrice volume24h priceChange24h lastUpdated } }`,
};

export const GAME_MUTATIONS = {
    UPDATE_USER_PROGRESS: `mutation UpdateUserProgress($userId: ID!, $progressData: ProgressInput!) { updateUserProgress(userId: $userId, progressData: $progressData) { success newLevel earnedCoins unlockedAchievements { id name } } }`,
    PURCHASE_ITEM: `mutation PurchaseItem($userId: ID!, $itemId: ID!, $quantity: Int!) { purchaseItem(userId: $userId, itemId: $itemId, quantity: $quantity) { success remainingCoins inventory { id quantity } } }`,
    SAVE_GAME_SESSION: `mutation SaveGameSession($sessionData: GameSessionInput!) { saveGameSession(sessionData: $sessionData) { success sessionId savedAt } }`,
};

export const GAME_SUBSCRIPTIONS = {
    MARKET_UPDATES: `subscription MarketUpdates { marketUpdates { bobyPrice volume24h priceChange24h timestamp } }`,
    GAME_EVENTS: `subscription GameEvents($userId: ID!) { gameEvents(userId: $userId) { eventType data timestamp } }`,
};

export { graphqlClient };
