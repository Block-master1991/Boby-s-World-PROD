import { logger } from "@/utils/logger";
import type { PoolConfig, PoolStats } from "./types";

/** Tracks when an object was acquired and its idle metadata */
interface ActiveEntry<T> {
  obj: T;
  acquiredAt: number;
}

interface AvailableEntry<T> {
  obj: T;
  releasedAt: number;
}

export abstract class ObjectPool<T> {
  protected active = new Map<T, ActiveEntry<T>>();
  protected available: AvailableEntry<T>[] = [];
  protected config: PoolConfig;
  protected stats = {
    created: 0,
    reused: 0,
    disposed: 0,
    peakUsage: 0,
    growCount: 0,
    shrinkCount: 0,
    lastCleanupTime: 0,
  };
  protected cleanupInterval: ReturnType<typeof setInterval> | null = null;

  /** Rolling window of hold durations (ms) for avgHoldTimeMs calculation */
  private holdTimeWindow: number[] = [];
  private readonly HOLD_TIME_WINDOW_SIZE = 200;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      initialSize: 10,
      maxSize: 100,
      growthFactor: 1.5,
      shrinkThreshold: 0.3,
      cleanupInterval: 30000,
      minAvailableRatio: 0.1,
      maxIdleTime: 120000,
      preWarm: true,
      ...config,
    };

    if (this.config.preWarm !== false) {
      this.initializePool();
    }
    this.startCleanupInterval();
  }

  protected abstract create(): T;
  protected abstract reset(obj: T): void;
  protected abstract dispose(obj: T): void;
  protected abstract isValid(obj: T): boolean;

  private initializePool(): void {
    for (let i = 0; i < this.config.initialSize; i++) {
      const obj = this.create();
      this.available.push({ obj, releasedAt: performance.now() });
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  get(): T {
    let obj: T;
    const now = performance.now();

    // Try to get from available pool (most recently released first for cache locality)
    if (this.available.length > 0) {
      const { obj: pooledObj } = this.available.pop()!;
      obj = pooledObj;
      this.stats.reused++;
    } else {
      // Create new object if pool is not at max capacity
      const currentTotal = this.active.size + this.available.length;
      if (currentTotal < this.config.maxSize) {
        obj = this.create();
        this.stats.created++;
        this.stats.growCount++;
      } else {
        // Pool is full – create one anyway but log a warning
        obj = this.create();
        this.stats.created++;
        logger.warn(
          `[ObjectPool] Pool full (max ${this.config.maxSize}), created overflow object. Active: ${this.active.size}`
        );
      }
    }

    this.reset(obj);
    this.active.set(obj, { obj, acquiredAt: now });

    // Update peak usage
    if (this.active.size > this.stats.peakUsage) {
      this.stats.peakUsage = this.active.size;
    }

    return obj;
  }

  release(obj: T): void {
    const entry = this.active.get(obj);
    if (!entry) {
      logger.warn("[ObjectPool] Attempted to release object not in active pool");
      return;
    }

    // Track hold time
    const holdDuration = performance.now() - entry.acquiredAt;
    this.holdTimeWindow.push(holdDuration);
    if (this.holdTimeWindow.length > this.HOLD_TIME_WINDOW_SIZE) {
      this.holdTimeWindow.shift();
    }

    this.active.delete(obj);

    // Check if object is still valid
    if (!this.isValid(obj)) {
      this.dispose(obj);
      this.stats.disposed++;
      return;
    }

    // Reset and return to available pool
    this.reset(obj);

    // Check if we need to shrink the pool
    const totalObjects = this.active.size + this.available.length + 1; // +1 for the object being released
    const minAvailable = Math.max(1, Math.ceil(this.config.initialSize * (this.config.minAvailableRatio ?? 0.1)));

    if (
      totalObjects > this.config.initialSize &&
      this.available.length / totalObjects > this.config.shrinkThreshold &&
      this.available.length > minAvailable
    ) {
      // Shrink: dispose the object being released + some idle ones
      this.dispose(obj);
      this.stats.disposed++;
      this.stats.shrinkCount++;

      // Also evict the oldest idle entries (up to 20% of available)
      const excessCount = Math.floor(this.available.length * 0.2);
      // Sort by releasedAt ascending (oldest first)
      this.available.sort((a, b) => a.releasedAt - b.releasedAt);
      for (let i = 0; i < excessCount && this.available.length > minAvailable; i++) {
        const excessEntry = this.available.shift();
        if (excessEntry) {
          this.dispose(excessEntry.obj);
          this.stats.disposed++;
        }
      }
    } else {
      this.available.push({ obj, releasedAt: performance.now() });
    }
  }

  private performCleanup(): void {
    const now = performance.now();
    this.stats.lastCleanupTime = now;
    const maxIdleTime = this.config.maxIdleTime ?? 120000;
    const minAvailable = Math.max(1, Math.ceil(this.config.initialSize * (this.config.minAvailableRatio ?? 0.1)));

    // Clean up invalid and expired idle objects from available pool
    const stillAvailable: AvailableEntry<T>[] = [];
    for (const entry of this.available) {
      const isExpired = now - entry.releasedAt > maxIdleTime;
      const isInvalid = !this.isValid(entry.obj);

      if (isInvalid || (isExpired && stillAvailable.length >= minAvailable)) {
        this.dispose(entry.obj);
        this.stats.disposed++;
        this.stats.shrinkCount++;
      } else {
        stillAvailable.push(entry);
      }
    }
    this.available = stillAvailable;

    // Log stats periodically
    const hitRate =
      this.stats.reused + this.stats.created > 0
        ? (this.stats.reused / (this.stats.reused + this.stats.created)) * 100
        : 0;

    logger.log(
      `[ObjectPool] Cleanup - Active: ${this.active.size}, Available: ${this.available.length}, Hit Rate: ${hitRate.toFixed(1)}%, Grows: ${this.stats.growCount}, Shrinks: ${this.stats.shrinkCount}`
    );
  }

  private computeAvgHoldTime(): number {
    if (this.holdTimeWindow.length === 0) return 0;
    const sum = this.holdTimeWindow.reduce((a, b) => a + b, 0);
    return sum / this.holdTimeWindow.length;
  }

  getStats(): PoolStats {
    const total = this.stats.reused + this.stats.created;
    const hitRate = total > 0 ? (this.stats.reused / total) * 100 : 0;

    return {
      active: this.active.size,
      available: this.available.length,
      total: this.active.size + this.available.length,
      created: this.stats.created,
      reused: this.stats.reused,
      disposed: this.stats.disposed,
      peakUsage: this.stats.peakUsage,
      hitRate,
      avgHoldTimeMs: Math.round(this.computeAvgHoldTime() * 100) / 100,
      growCount: this.stats.growCount,
      shrinkCount: this.stats.shrinkCount,
      lastCleanupTime: this.stats.lastCleanupTime,
    };
  }

  disposeAll(): void {
    // Dispose all active objects
    for (const entry of this.active.values()) {
      this.dispose(entry.obj);
    }
    this.active.clear();

    // Dispose all available objects
    for (const entry of this.available) {
      this.dispose(entry.obj);
    }
    this.available = [];

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Reset stats
    this.holdTimeWindow = [];

    logger.log(
      `[ObjectPool] Disposed all objects. Total disposed: ${this.stats.disposed}`
    );
  }
}
