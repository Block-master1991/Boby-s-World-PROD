// GraphQL Client with URQL for Efficient API Communication
// Simplified version for better compatibility

import {
    createClient,
    Client,
    cacheExchange,
    fetchExchange,
} from 'urql';

interface GraphQLResponse<T = any> {
    data?: T;
    errors?: Array<{ message: string; extensions?: any }>;
    extensions?: any;
}

// Simple error class for GraphQL
export class GraphQLError extends Error {
    public code?: string;
    public extensions?: any;

    constructor(message: string, extensions?: any) {
        super(message);
        this.name = 'GraphQLError';
        this.code = extensions?.code;
        this.extensions = extensions;
    }
}

// Configuration for different environments
const getGraphQLConfig = () => {
    const isDevelopment = process.env.NODE_ENV === 'development';

    return {
        url: isDevelopment
            ? 'http://localhost:4000/graphql' // Development GraphQL endpoint
            : '/api/graphql', // Production endpoint
        timeout: 30000, // 30 seconds
    };
};

// Create the main GraphQL client with basic setup
const createGraphQLClient = (): Client => {
    const config = getGraphQLConfig();

    const client = createClient({
        url: config.url,
        exchanges: [
            cacheExchange,
            fetchExchange,
        ],
        // Custom fetch implementation with timeout
        fetch: (input, init) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            return fetch(input, {
                ...init,
                headers: {
                    'Content-Type': 'application/json',
                    ...init?.headers,
                },
            }).finally(() => {
                clearTimeout(timeoutId);
            });
        },
    });

    return client;
};

// Singleton client instance
let graphqlClient: Client | null = null;

export const getGraphQLClient = (): Client => {
    if (!graphqlClient) {
        graphqlClient = createGraphQLClient();
    }
    return graphqlClient;
};

// Enhanced query wrapper with error handling
export const graphqlQuery = async <T = any>(
    query: string,
    variables?: Record<string, any>,
    options?: {
        requestPolicy?: 'cache-first' | 'cache-only' | 'network-only' | 'cache-and-network';
        context?: any;
    }
): Promise<GraphQLResponse<T>> => {
    const client = getGraphQLClient();

    try {
        const result = await client.query(query, variables || {}, {
            requestPolicy: options?.requestPolicy || 'cache-first',
            ...options?.context,
        }).toPromise();

        if (result.error) {
            // Convert URQL errors to our custom GraphQLError
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions)) || [];
            return {
                errors,
                extensions: result.error.networkError ? { networkError: true } : undefined,
            };
        }

        return {
            data: result.data,
            extensions: result.extensions,
        };

    } catch (error) {
        console.error('[GraphQL] Query failed:', error);
        return {
            errors: [new GraphQLError(error instanceof Error ? error.message : 'Unknown error')],
        };
    }
};

// Enhanced mutation wrapper
export const graphqlMutation = async <T = any>(
    mutation: string,
    variables?: Record<string, any>,
    options?: {
        context?: any;
        optimisticUpdate?: (cache: any) => void;
    }
): Promise<GraphQLResponse<T>> => {
    const client = getGraphQLClient();

    try {
        // Apply optimistic update if provided
        if (options?.optimisticUpdate) {
            // This would update the cache optimistically
            // Implementation depends on the cache exchange used
        }

        const result = await client.mutation(mutation, variables || {}, {
            ...options?.context,
        }).toPromise();

        if (result.error) {
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions)) || [];
            return {
                errors,
                extensions: result.error.networkError ? { networkError: true } : undefined,
            };
        }

        return {
            data: result.data,
            extensions: result.extensions,
        };

    } catch (error) {
        console.error('[GraphQL] Mutation failed:', error);
        return {
            errors: [new GraphQLError(error instanceof Error ? error.message : 'Unknown error')],
        };
    }
};

// Subscription wrapper (for real-time updates)
export const graphqlSubscription = (
    subscription: string,
    variables?: Record<string, any>,
    callback?: (result: GraphQLResponse) => void
) => {
    const client = getGraphQLClient();

    const subscriptionResult = client.subscription(subscription, variables || {});

    const unsubscribe = subscriptionResult.subscribe((result) => {
        if (result.error) {
            const errors = result.error.graphQLErrors?.map(err => new GraphQLError(err.message, err.extensions)) || [];
            callback?.({
                errors,
                extensions: result.error.networkError ? { networkError: true } : undefined,
            });
        } else {
            callback?.({
                data: result.data,
                extensions: result.extensions,
            });
        }
    });

    return unsubscribe;
};

// Utility functions
export const graphqlUtils = {
    // Clear cache
    clearCache: () => {
        // Note: resetStore might not be available in all URQL versions
        // This is a placeholder for cache clearing functionality
        console.log('[GraphQL] Cache clearing not implemented in this version');
    },

    // Get cache statistics
    getCacheStats: () => {
        // This would return cache statistics from the cache exchange
        return {
            operations: 0,
            cacheSize: 0,
            hitRate: 0,
        };
    },

    // Health check
    healthCheck: async (): Promise<boolean> => {
        try {
            const result = await graphqlQuery(`
                query HealthCheck {
                    health
                }
            `);
            return !result.errors && result.data?.health === 'OK';
        } catch {
            return false;
        }
    },
};

// Predefined GraphQL queries for common operations
export const GAME_QUERIES = {
    // Get user game data
    GET_USER_GAME_DATA: `
        query GetUserGameData($userId: ID!) {
            user(id: $userId) {
                id
                username
                gameStats {
                    level
                    coins
                    experience
                    achievements {
                        id
                        name
                        unlockedAt
                    }
                }
                inventory {
                    id
                    itemType
                    quantity
                    rarity
                }
            }
        }
    `,

    // Get game world data (paginated)
    GET_GAME_WORLD: `
        query GetGameWorld($chunkX: Int!, $chunkZ: Int!, $radius: Int) {
            gameWorld(chunkX: $chunkX, chunkZ: $chunkZ, radius: $radius) {
                chunks {
                    x
                    z
                    terrainData
                    entities {
                        id
                        type
                        position {
                            x
                            y
                            z
                        }
                    }
                }
            }
        }
    `,

    // Get market data
    GET_MARKET_DATA: `
        query GetMarketData {
            marketData {
                bobyPrice
                volume24h
                priceChange24h
                lastUpdated
            }
        }
    `,
};

export const GAME_MUTATIONS = {
    // Update user progress
    UPDATE_USER_PROGRESS: `
        mutation UpdateUserProgress($userId: ID!, $progressData: ProgressInput!) {
            updateUserProgress(userId: $userId, progressData: $progressData) {
                success
                newLevel
                earnedCoins
                unlockedAchievements {
                    id
                    name
                }
            }
        }
    `,

    // Purchase item
    PURCHASE_ITEM: `
        mutation PurchaseItem($userId: ID!, $itemId: ID!, $quantity: Int!) {
            purchaseItem(userId: $userId, itemId: $itemId, quantity: $quantity) {
                success
                remainingCoins
                inventory {
                    id
                    quantity
                }
            }
        }
    `,

    // Save game session
    SAVE_GAME_SESSION: `
        mutation SaveGameSession($sessionData: GameSessionInput!) {
            saveGameSession(sessionData: $sessionData) {
                success
                sessionId
                savedAt
            }
        }
    `,
};

export const GAME_SUBSCRIPTIONS = {
    // Real-time market updates
    MARKET_UPDATES: `
        subscription MarketUpdates {
            marketUpdates {
                bobyPrice
                volume24h
                priceChange24h
                timestamp
            }
        }
    `,

    // Live game events
    GAME_EVENTS: `
        subscription GameEvents($userId: ID!) {
            gameEvents(userId: $userId) {
                eventType
                data
                timestamp
            }
        }
    `,
};

// Export the client for direct use if needed
export { graphqlClient };
