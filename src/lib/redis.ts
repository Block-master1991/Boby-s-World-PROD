import type { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import Redis from 'ioredis';
import { logger } from 'utils/logger';

let redisInstance: Redis | Cluster | null = null;

// Define a recursive dummy interface to satisfy typing
interface DummyRedis {
    then: (resolve: (value: null) => void) => void;
    catch: () => DummyRedis;
    [key: string]: unknown;
}

const createDummyRedisHandler = (): unknown => {
    // Return a chainable proxy for dummy calls (supports multi().setex().exec())
    const dummy = (() => dummy) as unknown as DummyRedis;
    
    // Add then/catch methods to make it awaitable and chainable
    dummy.then = (resolve) => resolve(null);
    dummy.catch = () => dummy;
    
    // Allow property access to return the dummy function itself
    return new Proxy(dummy, {
        get: (_target, prop) => {
             // Treat then/catch specially for Promise compatibility
            if (prop === 'then') return (resolve: (value: null) => void) => resolve(null);
            if (prop === 'catch') return () => dummy;
            return dummy;
        }
    });
};

const sanitizeRedisUrl = (url: string): string => {
    let sanitized = url
        .replace(/^redis-cli\s+/, '')
        .replace(/--tls\s+/, '')
        .replace(/-u\s+/, '')
        .trim();

    // Auto-fix Protocol for Upstash (requires TLS 'rediss://')
    if (sanitized.includes('upstash') && sanitized.startsWith('redis://')) {
        sanitized = sanitized.replace('redis://', 'rediss://');
        if (process.env.NODE_ENV === 'development') {
            logger.log('[Redis] Auto-converted Upstash URL to rediss:// (TLS)');
        }
    }
    return sanitized;
};

const getClusterOptions = (tlsOptions: object): ClusterOptions => ({
    redisOptions: {
        ...tlsOptions,
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
    },
    scaleReads: 'slave'
});

const getStandardOptions = (tlsOptions: object): RedisOptions => ({
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    // Explicitly enable TLS options if protocol is rediss://
    ...tlsOptions,
    retryStrategy: (times: number) => {
        if (times > 5) return null; // Stop after 5 retries
        return Math.min(times * 100, 2000); // Backoff
    }
});

const getRedis = (): Redis | Cluster => {
    if (!redisInstance && process.env.REDIS_URL) {
        try {
            const connectionUrl = sanitizeRedisUrl(process.env.REDIS_URL);
            const isCluster = process.env.REDIS_CLUSTER_MODE === 'true';
            const isTls = connectionUrl.startsWith('rediss://');

            // Common TLS options
            const tlsOptions = isTls ? { tls: { rejectUnauthorized: false } } : {};

            if (isCluster) {
                // Initialize Cluster
                const nodes = connectionUrl.split(',').map(url => url.trim());
                logger.log('[Redis] Initializing in CLUSTER mode');
                redisInstance = new Redis.Cluster(nodes, getClusterOptions(tlsOptions));
            } else {
                // Initialize Standard Client
                redisInstance = new Redis(connectionUrl, getStandardOptions(tlsOptions));
            }

            if (redisInstance) {
                redisInstance.on('connect', () => {
                    if (process.env.NODE_ENV === 'development') {
                        logger.log('[Redis] Connected successfully.');
                    }
                });

                redisInstance.on('error', (err: Error & { code?: string }) => {
                    // Suppress noise during build, but log real runtime errors
                    // Silent error during build or if it's a known connection issue
                    if (process.env['NEXT_PHASE'] === 'phase-production-build' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
                        // Log as warning only in dev
                        if (process.env.NODE_ENV === 'development') {
                            logger.warn('[Redis] Connection failed (silent fallback enabled):', err.message);
                        }
                    } else {
                        logger.error('[Redis] Connection Error:', err.message);
                    }
                });
            }
        } catch (e) {
            logger.error('[Redis] Critical initialization failure:', e);
            redisInstance = null;
        }
    }
    // We cast to Redis because the proxy interface expects it, 
    // even though it might be a Cluster or null (which returns types from proxy).
    return redisInstance as Redis;
};

// Export a proxy to maintain backward compatibility with 'import redis from ...'
const redisProxy = new Proxy({} as Redis, {
    get: (_target, prop) => {
        const instance = getRedis();

        // If no instance, return dummy functions to prevent crashes
        if (!instance) {
            return createDummyRedisHandler();
        }

        // We use 'unknown' cast first to safely access arbitrary properties
        const val = (instance as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? val.bind(instance) : val;
    }
});

export default redisProxy;
