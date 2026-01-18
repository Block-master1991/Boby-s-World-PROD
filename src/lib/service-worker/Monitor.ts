/**
 * Service Worker Performance Monitor
 */

import type { PerformanceMetrics } from './types';

export class PerformanceMonitor {
    private metrics: PerformanceMetrics = {
        loadTimes: [],
        cacheHits: 0,
        cacheMisses: 0,
        networkRequests: 0,
        errors: 0,
    };

    public recordLoadTime(time: number): void {
        this.metrics.loadTimes.push(time);
        if (this.metrics.loadTimes.length > 100) {
            this.metrics.loadTimes.shift();
        }
    }

    public recordCacheHit(): void {
        this.metrics.cacheHits++;
    }

    public recordCacheMiss(): void {
        this.metrics.cacheMisses++;
    }

    public recordNetworkRequest(): void {
        this.metrics.networkRequests++;
    }

    public recordError(): void {
        this.metrics.errors++;
    }

    public getPerformanceStats() {
        const avgLoadTime = this.metrics.loadTimes.length > 0 ?
            this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length : 0;

        const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 ?
            (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 : 0;

        return {
            averageLoadTime: `${avgLoadTime.toFixed(2)}ms`,
            cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
            totalRequests: this.metrics.networkRequests,
            totalErrors: this.metrics.errors,
            samples: this.metrics.loadTimes.length,
        };
    }
}
