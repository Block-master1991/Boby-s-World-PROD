/**
 * GraphQL Per-Mutation Rate Limiter
 * Rate limiting system specific to each mutation in GraphQL
 * Provides advanced protection for sensitive operations
 */

import { logger } from 'utils/logger';
import redis from './redis';

/**
 * Rate limits per mutation (requests per minute)
 * Financial operations have very strict limits
 */
const MUTATION_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
    // Financial mutations - Very strict
    'withdrawUSDT': { limit: 3, windowSeconds: 60 },
    'purchaseItem': { limit: 10, windowSeconds: 60 },

    // Game actions - Moderate
    'useItem': { limit: 20, windowSeconds: 60 },
    'useConsumableItem': { limit: 20, windowSeconds: 60 },
    'consumeProtectionBottle': { limit: 20, windowSeconds: 60 },
    'addCoins': { limit: 30, windowSeconds: 60 },
    'applyPenalty': { limit: 30, windowSeconds: 60 },

    // Progress updates - Frequent
    'updateUserProgress': { limit: 60, windowSeconds: 60 },
    'saveGameSession': { limit: 30, windowSeconds: 60 },
    'fetchPlayerData': { limit: 60, windowSeconds: 60 },

    // Admin mutations - Strict
    'createStoreItem': { limit: 5, windowSeconds: 60 },
    'updateStoreItem': { limit: 10, windowSeconds: 60 },
    'deleteStoreItem': { limit: 5, windowSeconds: 60 },
    'toggleItemStatus': { limit: 10, windowSeconds: 60 },
    'updateItemPrice': { limit: 10, windowSeconds: 60 },
    'reinitializeStoreItems': { limit: 2, windowSeconds: 300 }, // 2 per 5 minutes

    // Auth mutations
    'generateAuthNonce': { limit: 10, windowSeconds: 60 },
    'login': { limit: 5, windowSeconds: 60 },
};

/**
 * Default limit for unknown mutations
 */
const DEFAULT_MUTATION_LIMIT = { limit: 30, windowSeconds: 60 };

export interface MutationRateLimitResult {
    allowed: boolean;
    remaining: number;
    limit: number;
    retryAfterSeconds?: number;
    mutationName: string;
}

/**
 * Extract mutation name from GraphQL query string
 */
export function extractMutationName(query: string): string | null {
    // Match mutation { mutationName( or mutation MutationName { mutationName(
    const mutationMatch = query.match(/mutation\s*(?:\w+\s*)?\{[\s\n]*(\w+)\s*\(/);
    if (mutationMatch?.[1]) {
        return mutationMatch[1];
    }

    // Fallback: try to match just the mutation name
    const simpleMatch = query.match(/mutation\s*\{[\s\n]*(\w+)/);
    if (simpleMatch?.[1]) {
        return simpleMatch[1];
    }

    return null;
}

interface RateLimitExceededParams {
    mutationName: string;
    identifier: string;
    redisKey: string;
    limit: number;
    windowSeconds: number;
}

async function handleRateLimitExceeded(params: RateLimitExceededParams): Promise<MutationRateLimitResult> {
    const { mutationName, identifier, redisKey, limit, windowSeconds } = params;
    const ttl = await redis.ttl(redisKey);
    logger.warn(`[GraphQL-RateLimit] Mutation ${mutationName} rate limit exceeded for ${identifier}. Count: ${limit}/${limit}`);
    return {
        allowed: false,
        remaining: 0,
        limit,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
        mutationName
    };
}

/**
 * Check rate limit for a specific GraphQL mutation
 */
export async function checkGraphQLMutationRateLimit(
    clientIp: string,
    mutationName: string,
    userId?: string
): Promise<MutationRateLimitResult> {
    const config = MUTATION_LIMITS[mutationName] || DEFAULT_MUTATION_LIMIT;
    const { limit, windowSeconds } = config;
    const identifier = userId ? `${clientIp}:${userId}` : clientIp;
    const redisKey = `graphql:ratelimit:${mutationName}:${identifier}`;

    try {
        const current = await redis.get(redisKey);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= limit) {
            return await handleRateLimitExceeded({ mutationName, identifier, redisKey, limit, windowSeconds });
        }

        if (count === 0) {
            await redis.set(redisKey, '1', 'EX', windowSeconds);
        } else {
            await redis.incr(redisKey);
        }

        const remaining = Math.max(0, limit - count - 1);
        logger.log(`[GraphQL-RateLimit] Mutation ${mutationName} allowed for ${identifier}. Count: ${count + 1}/${limit}, Remaining: ${remaining}`);

        return { allowed: true, remaining, limit, mutationName };
    } catch (error) {
        logger.error(`[GraphQL-RateLimit] Error checking rate limit for ${mutationName}:`, error);
        return { allowed: true, remaining: limit, limit, mutationName };
    }
}

/**
 * Get rate limit statistics for a mutation
 */
export async function getMutationRateLimitStats(
    mutationName: string
): Promise<{ totalKeys: number; mutations: string[] }> {
    try {
        const pattern = `graphql:ratelimit:${mutationName}:*`;
        const keys = await redis.keys(pattern);

        return {
            totalKeys: keys.length,
            mutations: Object.keys(MUTATION_LIMITS)
        };
    } catch (error) {
        logger.error('[GraphQL-RateLimit] Error getting stats:', error);
        return { totalKeys: 0, mutations: [] };
    }
}

/**
 * Get all mutation rate limit configurations
 */
export function getMutationRateLimitConfigs(): Record<string, { limit: number; windowSeconds: number }> {
    return { ...MUTATION_LIMITS };
}
