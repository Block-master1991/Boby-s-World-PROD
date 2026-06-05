import { professionalLogger } from "../index";
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
  onLimitExceeded?: (identifier: string, type: "user" | "endpoint" | "global") => void;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: true,
  perUser: {
    max: 1000,
    windowMs: 60000, // 1 minute
  },
  perEndpoint: {
    max: 5000,
    windowMs: 60000,
  },
  global: {
    max: 10000,
    windowMs: 60000,
  },
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
  private userLimits: Map<string, RateLimitEntry> = new Map();
  private endpointLimits: Map<string, RateLimitEntry> = new Map();
  private globalLimit: RateLimitEntry | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.enabled) {
      this.startCleanup();
    }
  }

  /**
   * Check if log is allowed (all checks)
   */
  checkLimit(userId?: string, endpoint?: string): Promise<RateLimitResult> {
    if (!this.config.enabled) {
      return Promise.resolve({
        allowed: true,
        remaining: Infinity,
        resetAt: 0,
        identifier: "disabled",
      });
    }

    // 1. Check global limit first (fastest failure)
    if (this.config.global) {
      const globalResult = this.checkGlobalLimit();
      if (!globalResult.allowed) return Promise.resolve(globalResult);
    }

    // 2. Check user limit
    if (userId && this.config.perUser) {
      const userResult = this.checkUserLimit(userId);
      if (!userResult.allowed) return Promise.resolve(userResult);
    }

    // 3. Check endpoint limit
    if (endpoint && this.config.perEndpoint) {
      const endpointResult = this.checkEndpointLimit(endpoint);
      if (!endpointResult.allowed) return Promise.resolve(endpointResult);
    }

    // Everything allowed
    return Promise.resolve({
      allowed: true,
      remaining: this.getRemaining(userId, endpoint),
      resetAt: this.getReset(userId, endpoint),
      identifier: userId || endpoint || "global",
    });
  }

  /**
   * Check global rate limit
   */
  private checkGlobalLimit(): RateLimitResult {
    return this.processEntryCount({
      id: "global",
      cfg: this.config.global!,
      getter: () => this.globalLimit,
      setter: e => {
        this.globalLimit = e;
      },
      type: "global",
    });
  }

  /**
   * Check per-user rate limit
   */
  private checkUserLimit(userId: string): RateLimitResult {
    return this.processEntryCount({
      id: `user:${userId}`,
      cfg: this.config.perUser!,
      getter: () => this.userLimits.get(userId) || null,
      setter: e => {
        this.userLimits.set(userId, e);
      },
      originalId: userId,
      type: "user",
    });
  }

  /**
   * Check per-endpoint rate limit
   */
  private checkEndpointLimit(endpoint: string): RateLimitResult {
    return this.processEntryCount({
      id: `endpoint:${endpoint}`,
      cfg: this.config.perEndpoint!,
      getter: () => this.endpointLimits.get(endpoint) || null,
      setter: e => {
        this.endpointLimits.set(endpoint, e);
      },
      originalId: endpoint,
      type: "endpoint",
    });
  }

  /**
   * Core processing logic for an entry
   */
  private processEntryCount(opts: {
    id: string;
    cfg: { max: number; windowMs: number };
    getter: () => RateLimitEntry | null;
    setter: (e: RateLimitEntry) => void;
    originalId?: string;
    type: "user" | "endpoint" | "global";
  }): RateLimitResult {
    const { id, cfg, getter, setter, originalId, type } = opts;
    const now = Date.now();
    let entry = getter();

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + cfg.windowMs, firstHit: now };
      setter(entry);
    } else {
      entry.count++;
    }

    if (entry.count > cfg.max) {
      if (this.config.onLimitExceeded) {
        this.config.onLimitExceeded(originalId || id, type);
      }
      return { allowed: false, remaining: 0, resetAt: entry.resetAt, identifier: id };
    }

    return {
      allowed: true,
      remaining: cfg.max - entry.count,
      resetAt: entry.resetAt,
      identifier: id,
    };
  }

  /**
   * Get remaining limit (minimum across all active limits)
   */
  private getRemaining(userId?: string, endpoint?: string): number {
    let rem = Infinity;
    if (this.config.global && this.globalLimit) {
      rem = Math.min(rem, this.config.global.max - this.globalLimit.count);
    }
    if (userId && this.config.perUser) {
      const entry = this.userLimits.get(userId);
      if (entry) rem = Math.min(rem, this.config.perUser.max - entry.count);
    }
    if (endpoint && this.config.perEndpoint) {
      const entry = this.endpointLimits.get(endpoint);
      if (entry) rem = Math.min(rem, this.config.perEndpoint.max - entry.count);
    }
    return Math.max(0, rem);
  }

  /**
   * Get the farthest reset time across active limits
   */
  private getReset(userId?: string, endpoint?: string): number {
    let r = 0;
    if (this.globalLimit) r = Math.max(r, this.globalLimit.resetAt);
    if (userId) {
      const entry = this.userLimits.get(userId);
      if (entry) r = Math.max(r, entry.resetAt);
    }
    if (endpoint) {
      const entry = this.endpointLimits.get(endpoint);
      if (entry) r = Math.max(r, entry.resetAt);
    }
    return r;
  }

  /**
   * Start background cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.userLimits.forEach((e, k) => {
        if (now >= e.resetAt) this.userLimits.delete(k);
      });
      this.endpointLimits.forEach((e, k) => {
        if (now >= e.resetAt) this.endpointLimits.delete(k);
      });
      if (this.globalLimit && now >= this.globalLimit.resetAt) {
        this.globalLimit = null;
      }
    }, 60000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop cleanup and release resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset limits for specific identifiers or all
   */
  reset(userId?: string, endpoint?: string): void {
    if (userId) this.userLimits.delete(userId);
    if (endpoint) this.endpointLimits.delete(endpoint);
    if (!userId && !endpoint) {
      this.userLimits.clear();
      this.endpointLimits.clear();
      this.globalLimit = null;
    }
  }

  /**
   * Get current internal statistics
   */
  getStats() {
    return {
      userCount: this.userLimits.size,
      endpointCount: this.endpointLimits.size,
      globalCount: this.globalLimit?.count || 0,
    };
  }

  /**
   * Dynamic configuration update
   */
  updateConfig(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default production-ready instance
 */
export const rateLimitMiddleware = new RateLimitMiddleware({
  enabled: process.env["NODE_ENV"] === "production",
  perUser: { max: 1000, windowMs: 60000 },
  perEndpoint: { max: 5000, windowMs: 60000 },
  global: { max: 10000, windowMs: 60000 },
  onLimitExceeded: (id, type) => {
    professionalLogger.warn(`[RateLimit] Limit exceeded for ${type}: ${id}`, {
      rateLimit: { id, type },
    });
  },
});

/**
 * Functional wrapper for quick rate limit checks
 */
export function checkLogRateLimit(userId?: string, endpoint?: string): Promise<RateLimitResult> {
  return rateLimitMiddleware.checkLimit(userId, endpoint);
}
