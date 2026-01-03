
import { logger } from 'utils/logger';
import Redis, { Cluster } from 'ioredis';

let redisInstance: Redis | Cluster | null = null;

const getRedis = () => {
    if (!redisInstance && process.env.REDIS_URL) {
        try {
            // 1. Sanitize the URL (Fix common user copy-paste errors)
            // Removes 'redis-cli', '--tls', '-u' and whitespace
            let connectionUrl = process.env.REDIS_URL
                .replace(/^redis-cli\s+/, '')
                .replace(/--tls\s+/, '')
                .replace(/-u\s+/, '')
                .trim();

            // 2. Auto-fix Protocol for Upstash (requires TLS 'rediss://')
            if (connectionUrl.includes('upstash') && connectionUrl.startsWith('redis://')) {
                connectionUrl = connectionUrl.replace('redis://', 'rediss://');
                if (process.env.NODE_ENV === 'development') {
                    logger.log('[Redis] Auto-converted Upstash URL to rediss:// (TLS)');
                }
            }

            const isCluster = process.env.REDIS_CLUSTER_MODE === 'true';

            if (isCluster) {
                // Initialize Cluster
                // ioredis cluster accepts array of startup nodes or a single string
                const nodes = connectionUrl.split(',').map(url => url.trim());
                logger.log('[Redis] Initializing in CLUSTER mode');

                redisInstance = new Redis.Cluster(nodes, {
                    redisOptions: {
                        tls: connectionUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
                        maxRetriesPerRequest: 1,
                        connectTimeout: 5000,
                    },
                    scaleReads: 'slave'
                });
            } else {
                // Initialize Standard Client
                redisInstance = new Redis(connectionUrl, {
                    maxRetriesPerRequest: 3,
                    connectTimeout: 5000,
                    // Explicitly enable TLS options if protocol is rediss://
                    tls: connectionUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
                    retryStrategy: (times) => {
                        if (times > 5) return null; // Stop after 5 retries
                        return Math.min(times * 100, 2000); // Backoff
                    }
                });
            }

            if (redisInstance) {
                redisInstance.on('connect', () => {
                    if (process.env.NODE_ENV === 'development') {
                        logger.log('[Redis] Connected successfully.');
                    }
                });

                redisInstance.on('error', (err) => {
                    // Suppress noise during build, but log real runtime errors
                    // Silent error during build or if it's a known connection issue
                    if (process.env.NEXT_PHASE === 'phase-production-build' || (err as any).code === 'ENOTFOUND' || (err as any).code === 'ETIMEDOUT') {
                        // Log as warning only in dev
                        if (process.env.NODE_ENV === 'development') {
                            logger.warn('[Redis] Connection failed (silent fallback enabled):', (err as any).message);
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
    return redisInstance as Redis;
};

// Export a proxy to maintain backward compatibility with 'import redis from ...'
const redisProxy = new Proxy({} as Redis, {
    get: (target, prop) => {
        const instance = getRedis();

        // If no instance, return dummy functions to prevent crashes
        if (!instance) {
            // Return a chainable proxy for dummy calls (supports multi().setex().exec())
            const dummy: any = (...args: any[]) => {
                // If it's a 'then' or 'catch' call, treat it like a Promise
                if (prop === 'then') return Promise.resolve(null);
                if (prop === 'catch') return { then: (resolve: any) => resolve(null) };
                return dummy;
            };
            // Add then/catch methods to make it awaitable and chainable
            dummy.then = (resolve: any) => resolve(null);
            dummy.catch = (reject: any) => dummy;
            return dummy;
        }

        const val = (instance as any)[prop];
        return typeof val === 'function' ? val.bind(instance) : val;
    }
});

export default redisProxy;