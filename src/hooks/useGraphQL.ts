import { useState, useCallback, useEffect } from 'react';
import { useApiFetch } from '@/utils/api';
import { getGraphQLClient, GAME_QUERIES, GAME_MUTATIONS } from '@/lib/graphql-client';

interface GraphQLHookResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    execute: (variables?: any) => Promise<void>;
}

export const useGraphQL = <T = any>(
    query: string,
    options?: {
        variables?: any;
        skip?: boolean;
    }
): GraphQLHookResult<T> => {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async (variables?: any) => {
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

            setData(result.data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(errorMessage);
            console.error('[useGraphQL] Query failed:', errorMessage);
        } finally {
            setLoading(false);
        }
    }, [query, options?.variables]);

    useEffect(() => {
        if (!options?.skip) {
            execute();
        }
    }, [execute, options?.skip]);

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

export const useMarketData = () => {
    // Using useApiFetch for security and consistency
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async () => {
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
            console.error('[useMarketData] Error:', errorMessage);
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

export const useUserStats = () => {
    // Using useApiFetch for security and consistency
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async () => {
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
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[useUserStats] Error:', errorMessage);
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
            console.error('[useGraphQLMutation] Mutation failed:', errorMessage);
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
            console.error('[useConsumableItem] Failed to use item:', errorMessage);
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
            console.error('[useFetchPlayerData] Error:', errorMessage);
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
            console.error('[useAddCoins] Error:', errorMessage);
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
            console.error('[useWithdrawUSDT] Error:', errorMessage);
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
