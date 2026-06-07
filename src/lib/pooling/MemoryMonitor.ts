import { logger } from "@/utils/logger";
import { disposeAllPools } from "../object-pooling";
import { isMobileDevice } from "../utils";
import type { MemoryStats, MemoryThresholdConfig } from "./types";

// Memory Monitor for tracking overall memory usage with real-time monitoring and dynamic thresholds
export class MemoryMonitor {
  private memoryHistory: number[] = [];
  private maxHistorySize = 100;
  private warningThreshold = isMobileDevice() ? 350 * 1024 * 1024 : 800 * 1024 * 1024; // 350MB mobile, 800MB desktop
  private criticalThreshold = isMobileDevice() ? 500 * 1024 * 1024 : 1200 * 1024 * 1024; // 500MB mobile, 1.2GB desktop

  /** Early warning triggers at this fraction of the warning threshold */
  private earlyWarningRatio = 0.8;

  /** How often (ms) to re-evaluate thresholds dynamically */
  private dynamicReevaluationInterval: ReturnType<typeof setInterval> | null = null;
  private readonly DYNAMIC_REEVALUATION_MS = 30000;

  /** Counters for monitoring events */
  private emergencyCleanupCount = 0;
  private earlyWarningCount = 0;

  /** Timestamps for growth-rate calculation – used in computeTrend */
  private lastRecordTime = 0;
  private lastRecordedUsed = 0;

  /** Real-time monitoring interval */
  private realtimeMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private readonly REALTIME_MONITOR_MS = 2000; // Check every 2 seconds

  /** Callbacks for external subscribers */
  private warningCallbacks: Array<(stats: MemoryStats) => void> = [];
  private criticalCallbacks: Array<(stats: MemoryStats) => void> = [];

  constructor(warningThreshold?: number, criticalThreshold?: number) {
    if (warningThreshold) this.warningThreshold = warningThreshold;
    if (criticalThreshold) this.criticalThreshold = criticalThreshold;

    this.initializeThresholds();
    this.startRealtimeMonitoring();
    this.startDynamicReevaluation();
  }

  private initializeThresholds(): void {
    const memory = this.getMemoryUsage();
    if (memory && memory.limit) {
      // Set thresholds as percentages of the total heap limit
      // Typically, we want to warn at 60% and error at 80% of actual available heap
      this.warningThreshold = Math.min(this.warningThreshold, memory.limit * 0.6);
      this.criticalThreshold = Math.min(this.criticalThreshold, memory.limit * 0.8);

      logger.log(
        `[MemoryMonitor] Initialized dynamic thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)} (Limit=${this.formatBytes(memory.limit)})`
      );
    } else {
      logger.log(
        `[MemoryMonitor] Initialized static thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)}`
      );
    }
  }

  /** Start real-time memory monitoring at a high frequency */
  private startRealtimeMonitoring(): void {
    if (typeof window === "undefined") return;

    this.realtimeMonitorInterval = setInterval(() => {
      this.recordMemoryUsage();
    }, this.REALTIME_MONITOR_MS);
  }

  /** Periodically re-evaluate thresholds based on current heap limit */
  private startDynamicReevaluation(): void {
    if (typeof window === "undefined") return;

    this.dynamicReevaluationInterval = setInterval(() => {
      this.reevaluateThresholds();
    }, this.DYNAMIC_REEVALUATION_MS);
  }

  /** Dynamically adjust thresholds based on current heap limit */
  private reevaluateThresholds(): void {
    const memory = this.getMemoryUsage();
    if (!memory || !memory.limit) return;

    const newWarning = Math.min(
      isMobileDevice() ? 350 * 1024 * 1024 : 800 * 1024 * 1024,
      memory.limit * 0.6
    );
    const newCritical = Math.min(
      isMobileDevice() ? 500 * 1024 * 1024 : 1200 * 1024 * 1024,
      memory.limit * 0.8
    );

    // Only log if thresholds changed significantly (>5%)
    if (
      Math.abs(newWarning - this.warningThreshold) / this.warningThreshold > 0.05 ||
      Math.abs(newCritical - this.criticalThreshold) / this.criticalThreshold > 0.05
    ) {
      this.warningThreshold = newWarning;
      this.criticalThreshold = newCritical;
      logger.log(
        `[MemoryMonitor] Re-evaluated thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)}`
      );
    }
  }

  getMemoryUsage(): { used: number; total: number; limit: number } | null {
    if (typeof performance !== "undefined" && "memory" in performance) {
      const mem = (
        performance as unknown as {
          memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
        }
      ).memory;
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

      // Early warning check (before reaching the main warning threshold)
      const earlyWarningThreshold = this.warningThreshold * this.earlyWarningRatio;
      if (memory.used > earlyWarningThreshold && memory.used <= this.warningThreshold) {
        this.earlyWarningCount++;
        logger.warn(
          `[MemoryMonitor] EARLY WARNING: Memory usage ${this.formatBytes(memory.used)} approaching warning threshold (${this.formatBytes(this.warningThreshold)})`
        );
        const stats = this.getMemoryStats();
        this.warningCallbacks.forEach(cb => cb(stats));
      }

      // Check thresholds
      if (memory.used > this.criticalThreshold) {
        logger.error(
          `[MemoryMonitor] CRITICAL: Memory usage ${this.formatBytes(memory.used)} exceeds critical threshold`
        );
        this.triggerEmergencyCleanup();
        const stats = this.getMemoryStats();
        this.criticalCallbacks.forEach(cb => cb(stats));
      } else if (memory.used > this.warningThreshold) {
        logger.warn(
          `[MemoryMonitor] WARNING: Memory usage ${this.formatBytes(memory.used)} exceeds warning threshold`
        );
        this.triggerGarbageCollection();
        const stats = this.getMemoryStats();
        this.warningCallbacks.forEach(cb => cb(stats));
      }

      // Update growth-rate tracking (use Date.now for consistency with staleness calculation)
      this.lastRecordTime = Date.now();
      this.lastRecordedUsed = memory.used;
    }
  }

  /** Subscribe to warning events */
  onWarning(callback: (stats: MemoryStats) => void): () => void {
    this.warningCallbacks.push(callback);
    return () => {
      this.warningCallbacks = this.warningCallbacks.filter(cb => cb !== callback);
    };
  }

  /** Subscribe to critical events */
  onCritical(callback: (stats: MemoryStats) => void): () => void {
    this.criticalCallbacks.push(callback);
    return () => {
      this.criticalCallbacks = this.criticalCallbacks.filter(cb => cb !== callback);
    };
  }

  private triggerGarbageCollection(): void {
    // Force garbage collection if available (Chrome DevTools only)
    if (typeof window !== "undefined" && "gc" in window) {
      (window as unknown as { gc: () => void }).gc();
      logger.log("[MemoryMonitor] Forced garbage collection");
    }
  }

  private triggerEmergencyCleanup(): void {
    this.emergencyCleanupCount++;
    logger.warn("[MemoryMonitor] EMERGENCY: Triggering full object pool disposal");
    disposeAllPools();
    this.triggerGarbageCollection();
  }

  private formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(1)}${units[unitIndex]}`;
  }

  /** Compute the memory trend over the recent history window */
  private computeTrend(): { direction: string; growthRateBytesPerSec: number; timeToCriticalSec: number } {
    if (this.memoryHistory.length < 2) {
      return { direction: "stable", growthRateBytesPerSec: 0, timeToCriticalSec: Infinity };
    }

    // Use the last 10 samples for trend calculation
    const recentCount = Math.min(10, this.memoryHistory.length);
    const recent = this.memoryHistory.slice(-recentCount);
    const [first] = recent;
    const last = recent[recent.length - 1]!;
    const delta = last - first!;

    // Note: lastRecordTime and lastRecordedUsed are updated in recordMemoryUsage()
    // with the actual current value, not the trend sample value

    // Estimate time span: each sample is roughly REALTIME_MONITOR_MS apart
    const timeSpanSec = (recentCount - 1) * (this.REALTIME_MONITOR_MS / 1000);
    const growthRateBytesPerSec = timeSpanSec > 0 ? delta / timeSpanSec : 0;

    // Determine direction using absolute delta
    const absDelta = Math.abs(delta);
    const threshold = 5 * 1024 * 1024; // 5MB threshold for "stable"
    let direction = "stable";
    if (absDelta > threshold) {
      direction = delta > 0 ? "increasing" : "decreasing";
    }

    // Estimate time to critical
    let timeToCriticalSec = Infinity;
    if (growthRateBytesPerSec > 0) {
      const remainingBytes = this.criticalThreshold - last;
      if (remainingBytes > 0) {
        timeToCriticalSec = remainingBytes / growthRateBytesPerSec;
      } else {
        timeToCriticalSec = 0;
      }
    }

    return { direction, growthRateBytesPerSec, timeToCriticalSec };
  }

  getMemoryStats(): MemoryStats {
    const current = this.getMemoryUsage();
    const average =
      this.memoryHistory.length > 0
        ? this.memoryHistory.reduce((a, b) => a + b, 0) / this.memoryHistory.length
        : 0;

    const trend = this.computeTrend();

    // Use lastRecordTime and lastRecordedUsed for staleness detection
    const stalenessMs = this.lastRecordTime > 0 ? Date.now() - this.lastRecordTime : -1;
    const usedDelta = current && this.lastRecordedUsed > 0
      ? current.used - this.lastRecordedUsed
      : 0;

    return {
      current: current ? this.formatBytes(current.used) : "N/A",
      average: this.formatBytes(average),
      peak:
        this.memoryHistory.length > 0 ? this.formatBytes(Math.max(...this.memoryHistory)) : "N/A",
      warningThreshold: this.formatBytes(this.warningThreshold),
      criticalThreshold: this.formatBytes(this.criticalThreshold),
      trend: stalenessMs > 10_000 ? "stale" : trend.direction,
      growthRateBytesPerSec: Math.round(trend.growthRateBytesPerSec),
      timeToCriticalSec: trend.timeToCriticalSec === Infinity ? Infinity : Math.round(trend.timeToCriticalSec),
      emergencyCleanups: this.emergencyCleanupCount,
      earlyWarnings: this.earlyWarningCount,
      lastRecordedUsed: this.formatBytes(this.lastRecordedUsed),
      usedDeltaSinceLast: this.formatBytes(usedDelta),
      monitoringStalenessMs: stalenessMs,
    };
  }

  /** Configure threshold behavior at runtime */
  setThresholdConfig(config: Partial<MemoryThresholdConfig>): void {
    if (config.warning !== undefined) this.warningThreshold = config.warning;
    if (config.critical !== undefined) this.criticalThreshold = config.critical;
    if (config.earlyWarningRatio !== undefined) this.earlyWarningRatio = config.earlyWarningRatio;
    logger.log(
      `[MemoryMonitor] Updated thresholds: Warning=${this.formatBytes(this.warningThreshold)}, Critical=${this.formatBytes(this.criticalThreshold)}, EarlyWarningRatio=${this.earlyWarningRatio}`
    );
  }

  /** Stop all monitoring intervals – call on cleanup/dispose */
  stopMonitoring(): void {
    if (this.realtimeMonitorInterval) {
      clearInterval(this.realtimeMonitorInterval);
      this.realtimeMonitorInterval = null;
    }
    if (this.dynamicReevaluationInterval) {
      clearInterval(this.dynamicReevaluationInterval);
      this.dynamicReevaluationInterval = null;
    }
    this.warningCallbacks = [];
    this.criticalCallbacks = [];
  }
}
