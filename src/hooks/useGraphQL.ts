import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useApiFetch } from '@/utils/api';
import { getGraphQLClient, GAME_QUERIES, GAME_MUTATIONS } from '@/lib/graphql-client';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';

interface GraphQLHookResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    execute: (variables?: any) => Promise<void>;
}

// Cache for GraphQL results to prevent duplicate requests
const graphqlCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
const pendingRequests = new Map<string, Promise<any>>();
const DEFAULT_CACHE_TTL = 30000; // 30 seconds

export const useGraphQL = <T = any>(
    query: string,
    options?: {
        variables?: any;
        skip?: boolean;
        cacheTTL?: number; // Custom TTL in milliseconds
    }
): GraphQLHookResult<T> => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cacheKey = useMemo(() => {
        const variables = options?.variables || {};
        return `${query.trim()}-${JSON.stringify(variables)}`;
    }, [query, options?.variables]);

    const cacheTTL = options?.cacheTTL || DEFAULT_CACHE_TTL;

    const execute = useCallback(async (variables?: any) => {
        // Check cache first
        const now = Date.now();
        const cached = graphqlCache.get(cacheKey);
        if (cached && (now - cached.timestamp) < cacheTTL) {
            logger.log(`[useGraphQL] Using cached result for: ${cacheKey.substring(0, 50)}...`);
            logger.log(`[useGraphQL] Using cached result for: ${cacheKey.substring(0, 50)}...`);
            setData(cached.data);
            setError(null);
            return cached.data;
        }

        // Check if there's a pending request for the same query
        if (pendingRequests.has(cacheKey)) {
            logger.log(`[useGraphQL] Waiting for pending request: ${cacheKey.substring(0, 50)}...`);
            try {
                const result = await pendingRequests.get(cacheKey);
                setData(result);
                setError(null);
                return result;
            } catch (err) {
                // If pending request failed, we'll try again
                logger.log(`[useGraphQL] Pending request failed, retrying: ${cacheKey.substring(0, 50)}...`);
            }
        }

        // Create new request
        const requestPromise = (async () => {
            setLoading(true);
            setError(null);

            try {
                const client = getGraphQLClient();
                const result = await client.query(query, variables || options?.variables || {}, {
                    requestPolicy: 'network-only', // Always fetch fresh data
                }).toPromise();

                if (result.error) {
                    throw new Error(result.error.message);
                }

                // Cache the result
                graphqlCache.set(cacheKey, {
                    data: result.data,
                    timestamp: now,
                    ttl: cacheTTL
                });

                // Set TTL cleanup
                setTimeout(() => {
                    graphqlCache.delete(cacheKey);
                }, cacheTTL);

                return result.data;
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                setError(errorMessage);
                logger.error('[useGraphQL] Query failed:', errorMessage);
                throw err; // Re-throw to be caught by caller
            } finally {
                setLoading(false);
                pendingRequests.delete(cacheKey);
            }
        })();

        // Store pending request
        pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            setData(result);
            return result;
        } catch (err) {
            // Error already handled above
            return null;
        }
    }, [query, options?.variables, cacheKey, cacheTTL]);

    useEffect(() => {
        if (!options?.skip) {
            execute();
        }

        // Cleanup function
        return () => {
            // Clean up cache after unmount if needed
            // This prevents memory leaks in long-running apps
        };
    }, [options?.skip]); // Remove execute from dependencies to prevent re-executions

    return {
        data,
        loading,
        error,
        execute,
    };
};

// Specialized hooks for common operations
export const useUserData = (userId: string) => {
    return useGraphQL(GAME_QUERIES.GET_USER_GAME_DATA, {
        variables: { userId },
        skip: !userId,
    });
};

// Simple global cache for market data to prevent redundant requests across components
let globalMarketDataCache: any = null;
let lastMarketDataFetchTime = 0;
const MARKET_DATA_CACHE_TTL = 60000; // 60 seconds

export const useMarketData = () => {
    // Using useApiFetch for security and consistency
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(globalMarketDataCache);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (force = false) => {
        const now = Date.now();
        // Use cache if available and not expired, unless force refresh is requested
        if (!force && globalMarketDataCache && (now - lastMarketDataFetchTime < MARKET_DATA_CACHE_TTL)) {
            setData(globalMarketDataCache);
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        query GetMarketData {
                            marketData {
                                bobyPrice
                                volume24h
                                priceChange24h
                                lastUpdated
                            }
                        }
                    `,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            setData(result.data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            logger.error('[useMarketData] Error:', errorMessage);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    // Auto-execute on mount
    useEffect(() => {
        execute();
    }, [execute]);

    return {
        data,
        loading,
        error,
        execute,
    };
};

export const useUserInventory = (userId: string) => {
    return useGraphQL(`
        query GetUserInventory($userId: ID!) {
            userInventory(userId: $userId) {
                protectionBottleCount
                guardianShieldCount
                speedyPawsTreatCount
                coinMagnetTreatCount
                items {
                    id
                    itemType
                    name
                    quantity
                    rarity
                    image
                }
            }
        }
    `, {
        variables: { userId },
        skip: !userId,
    });
};

export const useUserStats = (requiredRole: 'admin' | 'user' = 'user') => {
    // Using useApiFetch for security and consistency
    const { apiFetch } = useApiFetch();
    const { isAuthenticated, user } = useAuth();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = user?.publicKey === ADMIN_WALLET_ADDRESS;
    const isAuthorized = requiredRole === 'admin' ? isAdmin : (!isAdmin || user?.publicKey !== ADMIN_WALLET_ADDRESS);

    const execute = useCallback(async () => {
        // Guard: Check authentication and professional role separation
        if (!isAuthenticated || !isAuthorized) {
            logger.log(`Guard blocked request: Auth=${isAuthenticated}, Role=${requiredRole}, IsAdmin=${isAdmin}`);
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        query GetUserStats {
                            userStats {
                                totalUsers
                                onlineUsers
                                offlineUsers
                                activeGames
                            }
                        }
                    `,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            setData(result.data);
        } catch (err) {
            // Improved error handling for network errors
            if (err instanceof Error &&
                (err.message?.includes('NetworkError') ||
                    err.message?.includes('Failed to fetch') ||
                    err.message?.includes('fetch resource'))) {
                // Network error - don't show error to user, just log
                logger.warn('Network error (will retry):', err.message);
                setError(null); // Clear error to avoid showing to user
            } else {
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                logger.error('Error:', errorMessage);
                setError(errorMessage);
            }
        } finally {
            setLoading(false);
        }
    }, [apiFetch, isAuthenticated, isAdmin]);

    // Auto-execute on mount
    useEffect(() => {
        if (isAuthenticated && isAuthorized) {
            execute();
        }
    }, [execute, isAuthenticated, isAuthorized]);

    return {
        data,
        loading,
        error,
        execute,
    };
};

// Hook for mutations
export const useGraphQLMutation = <T = any>(mutation: string) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (variables?: any): Promise<T | null> => {
        setLoading(true);
        setError(null);

        try {
            const client = getGraphQLClient();
            const result = await client.mutation(mutation, variables || {}, {}).toPromise();

            if (result.error) {
                throw new Error(result.error.message);
            }

            return result.data;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            logger.error('[useGraphQLMutation] Mutation failed:', errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    }, [mutation]);

    return {
        loading,
        error,
        execute,
    };
};

// Specialized authentication hooks
export const useAuthMutations = () => {
    const generateNonce = useCallback(async (publicKey: string) => {
        const client = getGraphQLClient();
        const result = await client.query(`
            mutation GenerateAuthNonce($publicKey: String!) {
                generateAuthNonce(publicKey: $publicKey) {
                    success
                    nonce
                    error
                }
            }
        `, { publicKey }).toPromise();

        if (result.error) {
            throw new Error(result.error.message);
        }

        return result.data?.generateAuthNonce;
    }, []);

    const login = useCallback(async (input: { publicKey: string; signature: string; nonce: string }) => {
        const client = getGraphQLClient();
        const result = await client.mutation(`
            mutation Login($input: LoginInput!) {
                login(input: $input) {
                    success
                    message
                    publicKey
                    error
                }
            }
        `, { input }).toPromise();

        if (result.error) {
            throw new Error(result.error.message);
        }

        return result.data?.login;
    }, []);

    return {
        generateNonce,
        login,
    };
};

// Hook for using consumable items
export const useConsumableItem = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const useItem = useCallback(async (userId: string, itemId: string, quantity: number) => {
        setLoading(true);
        setError(null);

        try {
            const client = getGraphQLClient();
            const result = await client.mutation(`
                mutation UseConsumableItem($userId: ID!, $itemId: String!, $quantity: Int!) {
                    useConsumableItem(userId: $userId, itemId: $itemId, quantity: $quantity) {
                        success
                        message
                        remainingCount
                        error
                    }
                }
            `, { userId, itemId, quantity }).toPromise();

            if (result.error) {
                throw new Error(result.error.message);
            }

            return result.data?.useConsumableItem;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            logger.error('[useConsumableItem] Failed to use item:', errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        loading,
        error,
        useItem,
    };
};

// GameUI hooks using useApiFetch for security
export const useFetchPlayerData = () => {
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async (userId: string) => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        mutation FetchPlayerData($userId: ID!) {
                            fetchPlayerData(userId: $userId) {
                                success
                                playerData {
                                    level
                                    coins
                                    experience
                                    inventory {
                                        id
                                        itemType
                                        name
                                        quantity
                                        rarity
                                        image
                                    }
                                }
                                error
                            }
                        }
                    `,
                    variables: { userId }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            setData(result.data);
            return result.data?.fetchPlayerData;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            logger.error('[useFetchPlayerData] Error:', errorMessage);
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    return {
        data,
        loading,
        error,
        fetchData,
    };
};

export const useAddCoins = () => {
    const { apiFetch } = useApiFetch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addCoins = useCallback(async (userId: string, amount: number) => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        mutation AddCoins($userId: ID!, $amount: Int!) {
                            addCoins(userId: $userId, amount: $amount) {
                                success
                                newBalance
                                error
                            }
                        }
                    `,
                    variables: { userId, amount }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            return result.data?.addCoins;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            logger.error('[useAddCoins] Error:', errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    return {
        loading,
        error,
        addCoins,
    };
};

export const useWithdrawUSDT = () => {
    const { apiFetch } = useApiFetch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const withdrawUSDT = useCallback(async (userId: string, amount: number) => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        mutation WithdrawUSDT($userId: ID!, $amount: Float!) {
                            withdrawUSDT(userId: $userId, amount: $amount) {
                                success
                                withdrawalId
                                amount
                                error
                            }
                        }
                    `,
                    variables: { userId, amount }
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            return result.data?.withdrawUSDT;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            logger.error('[useWithdrawUSDT] Error:', errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    return {
        loading,
        error,
        withdrawUSDT,
    };
};

// GraphQL Subscription Hooks
export const useBobyPriceUpdates = () => {
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isSubscribed = true;
        let intervalId: NodeJS.Timeout | null = null;

        const subscribeToPriceUpdates = async () => {
            try {
                // For now, we'll use polling since we don't have WebSocket client set up yet
                // In production, this would use a WebSocket connection
                const pollPrice = async () => {
                    try {
                        const response = await apiFetch('/api/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: `
                                    subscription BobyPriceUpdates {
                                        bobyPriceUpdates {
                                            price
                                            changePercent
                                            timestamp
                                        }
                                    }
                                `,
                            }),
                        });

                        if (response.ok && isSubscribed) {
                            const result = await response.json();
                            if (result.data?.bobyPriceUpdates) {
                                setData(result.data.bobyPriceUpdates);
                                setError(null);
                            }
                        }
                    } catch (err) {
                        if (isSubscribed) {
                            const errorMessage = err instanceof Error ? err.message : 'Subscription error';
                            setError(errorMessage);
                            logger.error('[useBobyPriceUpdates] Error:', errorMessage);
                        }
                    }
                };

                // Poll every 30 seconds (matching server interval)
                intervalId = setInterval(pollPrice, 30000);

                // Initial poll
                pollPrice();
            } catch (err) {
                if (isSubscribed) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to setup subscription';
                    setError(errorMessage);
                    logger.error('[useBobyPriceUpdates] Setup error:', errorMessage);
                }
            }
        };

        subscribeToPriceUpdates();

        return () => {
            isSubscribed = false;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [apiFetch]);

    return {
        data,
        error,
    };
};

export const useUserActivityUpdates = (requiredRole: 'admin' | 'user' = 'user') => {
    const { apiFetch } = useApiFetch();
    const { isAuthenticated, user } = useAuth();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = user?.publicKey === ADMIN_WALLET_ADDRESS;
    const isAuthorized = requiredRole === 'admin' ? isAdmin : (!isAdmin || user?.publicKey !== ADMIN_WALLET_ADDRESS);

    useEffect(() => {
        let isSubscribed = true;
        let intervalId: NodeJS.Timeout | null = null;

        const subscribeToActivityUpdates = async () => {
            try {
                // Guard: Check authentication and professional role separation
                if (!isAuthenticated || !isAuthorized) {
                    if (isSubscribed) {
                        logger.log(`Guard active: Skipping updates for Role=${requiredRole}`);
                    }
                    return;
                }

                // Check if user is authenticated (has CSRF token)
                const hasCsrfToken = document.cookie.includes('csrfToken');
                if (!hasCsrfToken) {
                    logger.log('No CSRF token found, user likely logged out. Stopping activity updates.');
                    return;
                }

                // Polling implementation (would be WebSocket in production)
                const pollActivity = async () => {
                    try {
                        // Check CSRF token before each request
                        const currentHasCsrfToken = document.cookie.includes('csrfToken');
                        if (!currentHasCsrfToken) {
                            logger.log('CSRF token lost during polling, stopping activity updates.');
                            return;
                        }

                        const response = await apiFetch('/api/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: `
                                    query UserActivityUpdates {
                                        userActivityUpdates @client {
                                            onlineUsers
                                            activeGames
                                            timestamp
                                        }
                                    }
                                `,
                            }),
                        });

                        if (response.ok && isSubscribed) {
                            const result = await response.json();
                            if (result.data?.userActivityUpdates) {
                                setData(result.data.userActivityUpdates);
                                setError(null);
                            }
                        }
                    } catch (err) {
                        if (isSubscribed) {
                            // Improved error handling for network errors
                            if (err instanceof Error &&
                                (err.message?.includes('NetworkError') ||
                                    err.message?.includes('Failed to fetch') ||
                                    err.message?.includes('fetch resource'))) {
                                // Network error - don't show error to user, just log
                                logger.warn('Network error (will retry):', err.message);
                                setError(null); // Clear error to avoid showing to user
                            } else {
                                const errorMessage = err instanceof Error ? err.message : 'Activity subscription error';
                                setError(errorMessage);
                                logger.error('Error:', errorMessage);
                            }
                        }
                    }
                };

                // Poll every 10 seconds (matching server interval)
                intervalId = setInterval(pollActivity, 10000);

                // Initial poll
                pollActivity();
            } catch (err) {
                if (isSubscribed) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to setup activity subscription';
                    setError(errorMessage);
                    logger.error('Setup error:', errorMessage);
                }
            }
        };

        subscribeToActivityUpdates();

        return () => {
            isSubscribed = false;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [apiFetch, isAuthenticated, isAuthorized]);

    return {
        data,
        error,
    };
};

export const useGameEvents = (userId: string) => {
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) return;

        let isSubscribed = true;
        let intervalId: NodeJS.Timeout | null = null;

        const subscribeToGameEvents = async () => {
            try {
                // Polling implementation (would be WebSocket in production)
                const pollEvents = async () => {
                    try {
                        const response = await apiFetch('/api/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: `
                                    subscription GameEvents($userId: ID!) {
                                        gameEvents(userId: $userId) {
                                            eventType
                                            data
                                            timestamp
                                        }
                                    }
                                `,
                                variables: { userId }
                            }),
                        });

                        if (response.ok && isSubscribed) {
                            const result = await response.json();
                            if (result.data?.gameEvents) {
                                setData(result.data.gameEvents);
                                setError(null);
                            }
                        }
                    } catch (err) {
                        if (isSubscribed) {
                            const errorMessage = err instanceof Error ? err.message : 'Game events subscription error';
                            setError(errorMessage);
                            logger.error('[useGameEvents] Error:', errorMessage);
                        }
                    }
                };

                // Poll every 30 seconds (matching server interval)
                intervalId = setInterval(pollEvents, 30000);

                // Initial poll
                pollEvents();
            } catch (err) {
                if (isSubscribed) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to setup game events subscription';
                    setError(errorMessage);
                    logger.error('[useGameEvents] Setup error:', errorMessage);
                }
            }
        };

        subscribeToGameEvents();

        return () => {
            isSubscribed = false;
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [userId, apiFetch]);

    return {
        data,
        error,
    };
};
