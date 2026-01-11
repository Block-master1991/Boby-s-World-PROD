/**
 * Rate Limit Middleware - Prevent Log Abuse
 * Protects against log flooding and DoS attacks via excessive logging
 */

import { professionalLogger } from '../index';

export interface RateLimitConfig {
    enabled: boolean;
    perUser?: {
        max: number;
        windowMs: number;
    };
    perEndpoint?: {
        max: number;
        windowMs: number;
    };
    global?: {
        max: number;
        windowMs: number;
    };
    onLimitExceeded?: (identifier: string, type: 'user' | 'endpoint' | 'global') => void;
}

const DEFAULT_CONFIG: RateLimitConfig = {
    enabled: true,
    perUser: {
        max: 1000,
        windowMs: 60000 // 1 minute
    },
    perEndpoint: {
        max: 5000,
        windowMs: 60000
    },
    global: {
        max: 10000,
        windowMs: 60000
    }
};

/**
 * Rate limit entry
 */
interface RateLimitEntry {
    count: number;
    resetAt: number;
    firstHit: number;
}

/**
 * Rate Limit Result
 */
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
    identifier: string;
}

/**
 * Rate Limit Middleware Class
 */
export class RateLimitMiddleware {
    private config: RateLimitConfig;

    // In-memory stores (in production, use Redis for distributed rate limiting)
    private userLimits: Map<string, RateLimitEntry> = new Map();
    private endpointLimits: Map<string, RateLimitEntry> = new Map();
    private globalLimit: RateLimitEntry | null = null;

    // Cleanup interval
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(config: Partial<RateLimitConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Start cleanup interval
        if (this.config.enabled) {
            this.startCleanup();
        }
    }

    /**
     * Check if log is allowed (all checks)
     */
    async checkLimit(
        userId?: string,
        endpoint?: string
    ): Promise<RateLimitResult> {
        if (!this.config.enabled) {
            return {
                allowed: true,
                remaining: Infinity,
                resetAt: 0,
                identifier: 'disabled'
            };
        }

        // Check global limit first (fastest failure)
        if (this.config.global) {
            const globalResult = this.checkGlobalLimit();
            if (!globalResult.allowed) {
                return globalResult;
            }
        }

        // Check user limit
        if (userId && this.config.perUser) {
            const userResult = this.checkUserLimit(userId);
            if (!userResult.allowed) {
                return userResult;
            }
        }

        // Check endpoint limit
        if (endpoint && this.config.perEndpoint) {
            const endpointResult = this.checkEndpointLimit(endpoint);
            if (!endpointResult.allowed) {
                return endpointResult;
            }
        }

        // All checks passed
        return {
            allowed: true,
            remaining: this.getRemainingLimit(userId, endpoint),
            resetAt: this.getNextReset(userId, endpoint),
            identifier: userId || endpoint || 'global'
        };
    }

    /**
     * Check global rate limit
     */
    private checkGlobalLimit(): RateLimitResult {
        const now = Date.now();
        const config = this.config.global!;

        if (!this.globalLimit || now >= this.globalLimit.resetAt) {
            // Reset or initialize
            this.globalLimit = {
                count: 1,
                resetAt: now + config.windowMs,
                firstHit: now
            };

            return {
                allowed: true,
                remaining: config.max - 1,
                resetAt: this.globalLimit.resetAt,
                identifier: 'global'
            };
        }

        // Increment count
        this.globalLimit.count++;

        if (this.globalLimit.count > config.max) {
            // Limit exceeded
            if (this.config.onLimitExceeded) {
                this.config.onLimitExceeded('global', 'global');
            }

            return {
                allowed: false,
                remaining: 0,
                resetAt: this.globalLimit.resetAt,
                identifier: 'global'
            };
        }

        return {
            allowed: true,
            remaining: config.max - this.globalLimit.count,
            resetAt: this.globalLimit.resetAt,
            identifier: 'global'
        };
    }

    /**
     * Check per-user rate limit
     */
    private checkUserLimit(userId: string): RateLimitResult {
        const now = Date.now();
        const config = this.config.perUser!;
        const identifier = `user:${userId}`;

        let entry = this.userLimits.get(userId);

        if (!entry || now >= entry.resetAt) {
            // Reset or initialize
            entry = {
                count: 1,
                resetAt: now + config.windowMs,
                firstHit: now
            };
            this.userLimits.set(userId, entry);

            return {
                allowed: true,
                remaining: config.max - 1,
                resetAt: entry.resetAt,
                identifier
            };
        }

        // Increment count
        entry.count++;

        if (entry.count > config.max) {
            // Limit exceeded
            if (this.config.onLimitExceeded) {
                this.config.onLimitExceeded(userId, 'user');
            }

            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetAt,
                identifier
            };
        }

        return {
            allowed: true,
            remaining: config.max - entry.count,
            resetAt: entry.resetAt,
            identifier
        };
    }

    /**
     * Check per-endpoint rate limit
     */
    private checkEndpointLimit(endpoint: string): RateLimitResult {
        const now = Date.now();
        const config = this.config.perEndpoint!;
        const identifier = `endpoint:${endpoint}`;

        let entry = this.endpointLimits.get(endpoint);

        if (!entry || now >= entry.resetAt) {
            // Reset or initialize
            entry = {
                count: 1,
                resetAt: now + config.windowMs,
                firstHit: now
            };
            this.endpointLimits.set(endpoint, entry);

            return {
                allowed: true,
                remaining: config.max - 1,
                resetAt: entry.resetAt,
                identifier
            };
        }

        // Increment count
        entry.count++;

        if (entry.count > config.max) {
            // Limit exceeded
            if (this.config.onLimitExceeded) {
                this.config.onLimitExceeded(endpoint, 'endpoint');
            }

            return {
                allowed: false,
                remaining: 0,
                resetAt: entry.resetAt,
                identifier
            };
        }

        return {
            allowed: true,
            remaining: config.max - entry.count,
            resetAt: entry.resetAt,
            identifier
        };
    }

    /**
     * Get remaining limit (minimum across all limits)
     */
    private getRemainingLimit(userId?: string, endpoint?: string): number {
        let remaining = Infinity;

        if (this.config.global && this.globalLimit) {
            remaining = Math.min(remaining, this.config.global.max - this.globalLimit.count);
        }

        if (userId && this.config.perUser) {
            const entry = this.userLimits.get(userId);
            if (entry) {
                remaining = Math.min(remaining, this.config.perUser.max - entry.count);
            }
        }

        if (endpoint && this.config.perEndpoint) {
            const entry = this.endpointLimits.get(endpoint);
            if (entry) {
                remaining = Math.min(remaining, this.config.perEndpoint.max - entry.count);
            }
        }

        return Math.max(0, remaining);
    }

    /**
     * Get next reset time
     */
    private getNextReset(userId?: string, endpoint?: string): number {
        let resetAt = 0;

        if (this.config.global && this.globalLimit) {
            resetAt = Math.max(resetAt, this.globalLimit.resetAt);
        }

        if (userId && this.config.perUser) {
            const entry = this.userLimits.get(userId);
            if (entry) {
                resetAt = Math.max(resetAt, entry.resetAt);
            }
        }

        if (endpoint && this.config.perEndpoint) {
            const entry = this.endpointLimits.get(endpoint);
            if (entry) {
                resetAt = Math.max(resetAt, entry.resetAt);
            }
        }

        return resetAt;
    }

    /**
     * Start cleanup interval to remove expired entries
     */
    private startCleanup(): void {
        // Clean up every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);

        // Prevent keeping process alive
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();

        // Clean user limits
        for (const [userId, entry] of this.userLimits.entries()) {
            if (now >= entry.resetAt) {
                this.userLimits.delete(userId);
            }
        }

        // Clean endpoint limits
        for (const [endpoint, entry] of this.endpointLimits.entries()) {
            if (now >= entry.resetAt) {
                this.endpointLimits.delete(endpoint);
            }
        }

        // Clean global limit
        if (this.globalLimit && now >= this.globalLimit.resetAt) {
            this.globalLimit = null;
        }
    }

    /**
     * Stop cleanup interval
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Reset limits for specific identifier
     */
    reset(userId?: string, endpoint?: string): void {
        if (userId) {
            this.userLimits.delete(userId);
        }

        if (endpoint) {
            this.endpointLimits.delete(endpoint);
        }

        if (!userId && !endpoint) {
            // Reset all
            this.userLimits.clear();
            this.endpointLimits.clear();
            this.globalLimit = null;
        }
    }

    /**
     * Get current stats
     */
    getStats(): {
        userCount: number;
        endpointCount: number;
        globalCount: number;
    } {
        return {
            userCount: this.userLimits.size,
            endpointCount: this.endpointLimits.size,
            globalCount: this.globalLimit ? this.globalLimit.count : 0
        };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<RateLimitConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default instance
 */
export const rateLimitMiddleware = new RateLimitMiddleware({
    enabled: process.env.NODE_ENV === 'production',
    perUser: {
        max: 1000,
        windowMs: 60000
    },
    perEndpoint: {
        max: 5000,
        windowMs: 60000
    },
    global: {
        max: 10000,
        windowMs: 60000
    },
    onLimitExceeded: (identifier, type) => {
        professionalLogger.warn(`[RateLimit] Limit exceeded for ${type}: ${identifier}`, {
            rateLimit: { identifier, type }
        });
    }
});

/**
 * Helper function for quick rate limit check
 */
export async function checkLogRateLimit(
    userId?: string,
    endpoint?: string
): Promise<RateLimitResult> {
    return rateLimitMiddleware.checkLimit(userId, endpoint);
}
