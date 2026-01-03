/**
 * Performance Logger - High Precision Performance Monitoring
 * Tracks execution time, memory usage, and system resources
 */

import { professionalLogger, type LogContext } from '../index';
import { contextManager } from '../core/LogContext';

export interface PerformanceMetric {
    name: string;
    value: number;
    unit: 'ms' | 'ns' | 'bytes' | 'percent' | 'count';
    tags?: Record<string, string>;
    timestamp: number;
}

export interface PerformanceThresholds {
    warn: number;
    critical: number;
}

export interface PerformanceLoggerConfig {
    enabled: boolean;
    slowRequestThreshold: number; // ms
    slowQueryThreshold: number;   // ms
    memoryWarningThreshold: number; // bytes
    autoHeapStats: boolean;       // Automatically log heap usage
}

const DEFAULT_CONFIG: PerformanceLoggerConfig = {
    enabled: true,
    slowRequestThreshold: 1000,
    slowQueryThreshold: 500,
    memoryWarningThreshold: 500 * 1024 * 1024, // 500 MB
    autoHeapStats: process.env.NODE_ENV === 'production'
};

/**
 * Performance Logger Class
 */
export class PerformanceLogger {
    private static instance: PerformanceLogger;
    private config: PerformanceLoggerConfig;
    private timers: Map<string, number> = new Map();

    private constructor(config: Partial<PerformanceLoggerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    public static getInstance(config?: Partial<PerformanceLoggerConfig>): PerformanceLogger {
        if (!PerformanceLogger.instance) {
            PerformanceLogger.instance = new PerformanceLogger(config);
        }
        return PerformanceLogger.instance;
    }

    /**
     * Start a timer
     */
    startTimer(label: string): void {
        if (!this.config.enabled) return;
        this.timers.set(label, performance.now());
    }

    /**
     * Stop timer and log duration
     */
    endTimer(label: string, metadata: Record<string, any> = {}, thresholds?: PerformanceThresholds): number {
        if (!this.config.enabled) return 0;

        const startTime = this.timers.get(label);
        if (!startTime) {
            professionalLogger.warn(`Performance timer '${label}' ended without starting`);
            return 0;
        }

        const duration = performance.now() - startTime;
        this.timers.delete(label);

        this.logMetric(label, duration, 'ms', metadata, thresholds);
        return duration;
    }

    /**
     * Measure execution time of a function wrapper
     */
    async measure<T>(
        label: string,
        fn: () => Promise<T> | T,
        metadata: Record<string, any> = {},
        thresholds?: PerformanceThresholds
    ): Promise<T> {
        if (!this.config.enabled) return fn();

        const start = performance.now();
        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            this.logMetric(label, duration, 'ms', metadata, thresholds);
        }
    }

    /**
     * Log a performance metric
     */
    logMetric(
        name: string,
        value: number,
        unit: PerformanceMetric['unit'],
        metadata: Record<string, any> = {},
        thresholds?: PerformanceThresholds
    ): void {
        if (!this.config.enabled) return;

        const metric: PerformanceMetric = {
            name,
            value,
            unit,
            tags: { ...metadata, correlationId: contextManager.getCurrentContext()?.correlationId || 'unknown' },
            timestamp: Date.now()
        };

        let level: 'info' | 'warn' | 'error' = 'info';

        // Check thresholds
        if (thresholds) {
            if (value >= thresholds.critical) {
                level = 'error';
            } else if (value >= thresholds.warn) {
                level = 'warn';
            }
        } else if (unit === 'ms') {
            // Auto-detect slow operations based on default config
            if (name.includes('db') || name.includes('query')) {
                if (value >= this.config.slowQueryThreshold) level = 'warn';
            } else if (value >= this.config.slowRequestThreshold) {
                level = 'warn';
            }
        }

        professionalLogger[level](`Performance: ${name} took ${value.toFixed(2)}${unit}`, {
            performance: true,
            metric,
            ...metadata
        });
    }

    /**
     * Log System Resource Usage (Memory/CPU)
     */
    logResourceUsage(): void {
        if (!this.config.enabled || typeof process === 'undefined') return;

        const memUsage = process.memoryUsage();

        // Log Heap Used
        this.logMetric('memory_heap_used', memUsage.heapUsed, 'bytes', {}, {
            warn: this.config.memoryWarningThreshold,
            critical: this.config.memoryWarningThreshold * 1.5
        });

        // Log RSS
        this.logMetric('memory_rss', memUsage.rss, 'bytes');

        // CPU Usage (basic load avg)
        // Note: In serverless envs, this might not be accurate or available
        if (typeof require !== 'undefined') {
            try {
                const os = require('os');
                const load = os.loadavg();
                this.logMetric('cpu_load_1m', load[0], 'count');
            } catch {
                // Ignore if os module not available
            }
        }
    }
}

export const performanceLogger = PerformanceLogger.getInstance();
