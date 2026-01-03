/**
 * Sampling Middleware - Smart Log Sampling for Production
 * Reduces log volume in production while preserving important logs
 */

export interface SamplingConfig {
    enabled: boolean;
    rates?: {
        trace?: number;   // 0.0 to 1.0 (0% to 100%)
        debug?: number;
        info?: number;
        warn?: number;
        error?: number;
        fatal?: number;
    };
    adaptiveSampling?: boolean;  // Automatically adjust based on volume
    priorityRules?: Array<{
        condition: (entry: SampledLogEntry) => boolean;
        rate: number;
    }>;
}

const DEFAULT_CONFIG: SamplingConfig = {
    enabled: true,
    rates: {
        trace: 0,      // Never log trace in production
        debug: 0.01,    // 1% of debug logs
        info: 0.10,     // 10% of info logs
        warn: 1.0,      // All warnings
        error: 1.0,     // All errors
        fatal: 1.0      // All fatal logs
    },
    adaptiveSampling: false
};

/**
 * Sampled log entry
 */
export interface SampledLogEntry {
    level: string;
    message: string;
    metadata?: Record<string, any>;
    correlationId?: string;
    timestamp: number;
}

/**
 * Sampling stats
 */
export interface SamplingStats {
    total: number;
    sampled: number;
    dropped: number;
    byLevel: Record<string, { total: number; sampled: number; dropped: number }>;
}

/**
 * Sampling Middleware Class
 */
export class SamplingMiddleware {
    private config: SamplingConfig;
    private stats: SamplingStats = {
        total: 0,
        sampled: 0,
        dropped: 0,
        byLevel: {}
    };

    constructor(config: Partial<SamplingConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Determine if log should be sampled (kept)
     */
    shouldSample(entry: SampledLogEntry): boolean {
        if (!this.config.enabled) {
            return true; // If disabled, keep all logs
        }

        this.stats.total++;

        const level = entry.level.toLowerCase();

        // Initialize level stats if needed
        if (!this.stats.byLevel[level]) {
            this.stats.byLevel[level] = { total: 0, sampled: 0, dropped: 0 };
        }
        this.stats.byLevel[level].total++;

        // Check priority rules first
        if (this.config.priorityRules) {
            for (const rule of this.config.priorityRules) {
                if (rule.condition(entry)) {
                    const keep = this.sampleWithRate(rule.rate);
                    this.updateStats(level, keep);
                    return keep;
                }
            }
        }

        // Get sampling rate for level
        const rate = this.getSamplingRate(level);

        // Sample based on rate
        const keep = this.sampleWithRate(rate);

        this.updateStats(level, keep);

        return keep;
    }

    /**
     * Get sampling rate for log level
     */
    private getSamplingRate(level: string): number {
        const rates = this.config.rates || {};

        switch (level) {
            case 'trace':
                return rates.trace ?? 0;
            case 'debug':
                return rates.debug ?? 0.01;
            case 'info':
                return rates.info ?? 0.10;
            case 'warn':
                return rates.warn ?? 1.0;
            case 'error':
                return rates.error ?? 1.0;
            case 'fatal':
                return rates.fatal ?? 1.0;
            default:
                return 0.10; // Default 10%
        }
    }

    /**
     * Sample with given rate
     */
    private sampleWithRate(rate: number): boolean {
        if (rate >= 1.0) {
            return true; // Always keep
        }

        if (rate <= 0) {
            return false; // Always drop
        }

        // Deterministic sampling based on random
        return Math.random() < rate;
    }

    /**
     * Update statistics
     */
    private updateStats(level: string, kept: boolean): void {
        if (kept) {
            this.stats.sampled++;
            this.stats.byLevel[level].sampled++;
        } else {
            this.stats.dropped++;
            this.stats.byLevel[level].dropped++;
        }
    }

    /**
     * Get current stats
     */
    getStats(): SamplingStats {
        return { ...this.stats };
    }

    /**
     * Reset stats
     */
    resetStats(): void {
        this.stats = {
            total: 0,
            sampled: 0,
            dropped: 0,
            byLevel: {}
        };
    }

    /**
     * Get sampling efficiency (percentage dropped)
     */
    getEfficiency(): number {
        if (this.stats.total === 0) {
            return 0;
        }

        return (this.stats.dropped / this.stats.total) * 100;
    }

    /**
     * Add priority rule
     */
    addPriorityRule(
        condition: (entry: SampledLogEntry) => boolean,
        rate: number
    ): void {
        if (!this.config.priorityRules) {
            this.config.priorityRules = [];
        }

        this.config.priorityRules.push({ condition, rate });
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<SamplingConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Update sampling rate for specific level
     */
    updateRate(level: string, rate: number): void {
        if (!this.config.rates) {
            this.config.rates = {};
        }

        // Check if level is valid to avoid pollution
        const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
        if (validLevels.includes(level)) {
            (this.config.rates as any)[level] = rate;
        }
    }
}

/**
 * Default instance
 */
export const samplingMiddleware = new SamplingMiddleware({
    enabled: process.env.NODE_ENV === 'production',
    rates: {
        trace: 0,
        debug: 0.01,
        info: 0.10,
        warn: 1.0,
        error: 1.0,
        fatal: 1.0
    }
});

/**
 * Pre-defined priority rules
 */
export const commonPriorityRules = {
    // Always log errors and above
    alwaysLogErrors: (entry: SampledLogEntry) => {
        const level = entry.level.toLowerCase();
        return ['error', 'fatal', 'critical'].includes(level);
    },

    // Always log security events
    alwaysLogSecurity: (entry: SampledLogEntry) => {
        return entry.metadata?.security === true ||
            entry.message.includes('SECURITY') ||
            entry.metadata?.eventType?.includes('SECURITY');
    },

    // Always log audit events
    alwaysLogAudit: (entry: SampledLogEntry) => {
        return entry.metadata?.audit === true ||
            entry.message.includes('AUDIT');
    },

    // Never log health checks
    neverLogHealthChecks: (entry: SampledLogEntry) => {
        const message = entry.message.toLowerCase();
        return !message.includes('health') && !message.includes('ping');
    },

    // Sample high-frequency events less
    sampleHighFrequency: (entry: SampledLogEntry) => {
        const gameLoop = entry.metadata?.gameLoop === true;
        const highFreq = entry.message.includes('[HIGH_FREQ]');
        return !gameLoop && !highFreq;
    }
};

/**
 * Helper to create sampling middleware with common rules
 */
export function createSamplingWithRules(
    config?: Partial<SamplingConfig>
): SamplingMiddleware {
    const middleware = new SamplingMiddleware(config);

    // Add common rules
    middleware.addPriorityRule(commonPriorityRules.alwaysLogErrors, 1.0);
    middleware.addPriorityRule(commonPriorityRules.alwaysLogSecurity, 1.0);
    middleware.addPriorityRule(commonPriorityRules.alwaysLogAudit, 1.0);
    middleware.addPriorityRule(commonPriorityRules.neverLogHealthChecks, 0);

    return middleware;
}

/**
 * Helper function for quick sampling check
 */
export function shouldSampleLog(
    level: string,
    message: string,
    metadata?: Record<string, any>
): boolean {
    return samplingMiddleware.shouldSample({
        level,
        message,
        metadata,
        timestamp: Date.now()
    });
}
