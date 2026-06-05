import { logger } from "@/utils/logger";
import type { PoolConfig, PoolStats } from "./types";

export abstract class ObjectPool<T> {
  protected active = new Set<T>();
  protected available = new Array<T>();
  protected config: PoolConfig;
  protected stats = {
    created: 0,
    reused: 0,
    disposed: 0,
    peakUsage: 0,
  };
  protected cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = {
      initialSize: 10,
      maxSize: 100,
      growthFactor: 1.5,
      shrinkThreshold: 0.3,
      cleanupInterval: 30000, // 30 seconds
      ...config,
    };

    this.initializePool();
    this.startCleanupInterval();
  }

  protected abstract create(): T;
  protected abstract reset(obj: T): void;
  protected abstract dispose(obj: T): void;
  protected abstract isValid(obj: T): boolean;

  private initializePool(): void {
    for (let i = 0; i < this.config.initialSize; i++) {
      const obj = this.create();
      this.available.push(obj);
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  get(): T {
    let obj: T;

    // Try to get from available pool
    if (this.available.length > 0) {
      obj = this.available.pop()!;
      this.stats.reused++;
    } else {
      // Create new object if pool is not at max capacity
      if (this.active.size + this.available.length < this.config.maxSize) {
        obj = this.create();
        this.stats.created++;
      } else {
        // Pool is full, wait for an object to become available
        // For now, create a new one (could implement waiting queue later)
        obj = this.create();
        this.stats.created++;
        logger.warn(
          `[ObjectPool] Pool full, created additional object. Active: ${this.active.size}`
        );
      }
    }

    this.reset(obj);
    this.active.add(obj);

    // Update peak usage
    const currentUsage = this.active.size;
    if (currentUsage > this.stats.peakUsage) {
      this.stats.peakUsage = currentUsage;
    }

    return obj;
  }

  release(obj: T): void {
    if (!this.active.has(obj)) {
      logger.warn("[ObjectPool] Attempted to release object not in active pool");
      return;
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
    const totalObjects = this.active.size + this.available.length;
    if (
      totalObjects > this.config.initialSize &&
      this.available.length / totalObjects > this.config.shrinkThreshold
    ) {
      // Remove excess objects
      const excessCount = Math.floor(this.available.length * 0.2);
      for (let i = 0; i < excessCount; i++) {
        const excessObj = this.available.pop();
        if (excessObj) {
          this.dispose(excessObj);
          this.stats.disposed++;
        }
      }
    } else {
      this.available.push(obj);
    }
  }

  private performCleanup(): void {
    // Clean up invalid objects from available pool
    this.available = this.available.filter(obj => {
      if (!this.isValid(obj)) {
        this.dispose(obj);
        this.stats.disposed++;
        return false;
      }
      return true;
    });

    // Log stats periodically
    const hitRate =
      this.stats.reused + this.stats.created > 0
        ? (this.stats.reused / (this.stats.reused + this.stats.created)) * 100
        : 0;

    logger.log(
      `[ObjectPool] Cleanup - Active: ${this.active.size}, Available: ${this.available.length}, Hit Rate: ${hitRate.toFixed(1)}%`
    );
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
    };
  }

  disposeAll(): void {
    // Dispose all active objects
    for (const obj of this.active) {
      this.dispose(obj);
    }
    this.active.clear();

    // Dispose all available objects
    for (const obj of this.available) {
      this.dispose(obj);
    }
    this.available = [];

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.log(
      `[ObjectPool] Disposed all objects. Total disposed: ${this.stats.disposed + this.active.size + this.available.length}`
    );
  }
}
