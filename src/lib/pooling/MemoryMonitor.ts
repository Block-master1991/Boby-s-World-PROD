import { logger } from '@/utils/logger';
import { disposeAllPools } from '../object-pooling';
import { isMobileDevice } from '../utils';

// Memory Monitor for tracking overall memory usage
export class MemoryMonitor {
    private memoryHistory: number[] = [];
    private maxHistorySize = 100;
    private warningThreshold = isMobileDevice() ? 350 * 1024 * 1024 : 800 * 1024 * 1024; // 350MB mobile, 800MB desktop
    private criticalThreshold = isMobileDevice() ? 500 * 1024 * 1024 : 1200 * 1024 * 1024; // 500MB mobile, 1.2GB desktop

    constructor(warningThreshold?: number, criticalThreshold?: number) {
        if (warningThreshold) this.warningThreshold = warningThreshold;
        if (criticalThreshold) this.criticalThreshold = criticalThreshold;

        this.initializeThresholds();
    }

    private initializeThresholds(): void {
        const memory = this.getMemoryUsage();
        if (memory && memory.limit) {
            // Set thresholds as percentages of the total heap limit
            // Typically, we want to warn at 60% and error at 80% of actual available heap
            this.warningThreshold = Math.min(this.warningThreshold, memory.limit * 0.6);
            this.criticalThreshold = Math.min(this.criticalThreshold, memory.limit * 0.8);

            logger.log(`[MemoryMonitor] Initialized dynamic thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)} (Limit=${this.formatBytes(memory.limit)})`);
        } else {
            logger.log(`[MemoryMonitor] Initialized static thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)}`);
        }
    }

    getMemoryUsage(): { used: number; total: number; limit: number } | null {
        if (typeof performance !== 'undefined' && 'memory' in performance) {
            const mem = (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
            return {
                used: mem.usedJSHeapSize,
                total: mem.totalJSHeapSize,
                limit: mem.jsHeapSizeLimit,
            };
        }
        return null;
    }

    recordMemoryUsage(): void {
        const memory = this.getMemoryUsage();
        if (memory) {
            this.memoryHistory.push(memory.used);
            if (this.memoryHistory.length > this.maxHistorySize) {
                this.memoryHistory.shift();
            }

            // Check thresholds
            if (memory.used > this.criticalThreshold) {
                logger.error(`[MemoryMonitor] CRITICAL: Memory usage ${this.formatBytes(memory.used)} exceeds critical threshold`);
                this.triggerEmergencyCleanup();
            } else if (memory.used > this.warningThreshold) {
                logger.warn(`[MemoryMonitor] WARNING: Memory usage ${this.formatBytes(memory.used)} exceeds warning threshold`);
                this.triggerGarbageCollection();
            }
        }
    }

    private triggerGarbageCollection(): void {
        // Force garbage collection if available (Chrome DevTools only)
        if (typeof window !== 'undefined' && 'gc' in window) {
            (window as unknown as { gc: () => void }).gc();
            logger.log('[MemoryMonitor] Forced garbage collection');
        }
    }

    private triggerEmergencyCleanup(): void {
        logger.warn('[MemoryMonitor] EMERGENCY: Triggering full object pool disposal');
        disposeAllPools();
        this.triggerGarbageCollection();
    }

    private formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }

        return `${value.toFixed(1)}${units[unitIndex]}`;
    }

    getMemoryStats() {
        const current = this.getMemoryUsage();
        const average = this.memoryHistory.length > 0 ?
            this.memoryHistory.reduce((a, b) => a + b, 0) / this.memoryHistory.length : 0;

        return {
            current: current ? this.formatBytes(current.used) : 'N/A',
            average: this.formatBytes(average),
            peak: this.memoryHistory.length > 0 ? this.formatBytes(Math.max(...this.memoryHistory)) : 'N/A',
            warningThreshold: this.formatBytes(this.warningThreshold),
            criticalThreshold: this.formatBytes(this.criticalThreshold),
        };
    }
}
