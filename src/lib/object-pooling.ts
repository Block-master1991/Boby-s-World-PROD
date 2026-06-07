// Advanced Object Pooling System for Memory Optimization
// Reuses objects instead of creating/destroying them frequently

import type { THREE } from "@/lib/three-chunk";
import { logger } from "@/utils/logger";
import { MemoryMonitor } from "./pooling/MemoryMonitor";
import { MeshPool } from "./pooling/MeshPool";
import type { ObjectPool } from "./pooling/ObjectPool";
import { ParticleSystemPool } from "./pooling/ParticleSystemPool";
import { Vector3Pool } from "./pooling/Vector3Pool";
import type { MemoryStats, PoolStats } from "./pooling/types";

// Singleton instances
let meshPool: MeshPool | null = null;
let particlePool: ParticleSystemPool | null = null;
let vector3Pool: Vector3Pool | null = null;
let memoryMonitor: MemoryMonitor | null = null;

// Factory functions
export const initializeObjectPooling = (warningThreshold?: number, criticalThreshold?: number) => {
  // Initialize memory monitor
  memoryMonitor = new MemoryMonitor(warningThreshold, criticalThreshold);

  // Initialize vector pool (lightweight, can have more instances)
  vector3Pool = new Vector3Pool({
    initialSize: 50,
    maxSize: 500,
    growthFactor: 2,
  });

  // Subscribe to memory events for proactive pool management
  memoryMonitor.onWarning(stats => {
    logger.warn(`[ObjectPooling] Memory warning received: trend=${stats.trend}, timeToCritical=${stats.timeToCriticalSec}s`);
    // Proactively shrink pools when memory pressure is detected
    shrinkAllPools(0.3);
  });

  memoryMonitor.onCritical(stats => {
    logger.error(`[ObjectPooling] Memory critical! Emergency cleanup. emergencyCleanups=${stats.emergencyCleanups}`);
  });

  logger.log("[ObjectPooling] Initialized memory monitor and vector pool with proactive monitoring");
};

export const getMeshPool = (geometry: THREE.BufferGeometry, material: THREE.Material): MeshPool => {
  if (!meshPool) {
    meshPool = new MeshPool(geometry, material, {
      initialSize: 20,
      maxSize: 200,
      growthFactor: 1.5,
    });
  }
  return meshPool;
};

export const getParticleSystemPool = (): ParticleSystemPool => {
  if (!particlePool) {
    particlePool = new ParticleSystemPool(100, {
      initialSize: 5,
      maxSize: 50,
      growthFactor: 1.2,
    });
  }
  return particlePool;
};

export const getVector3Pool = (): Vector3Pool => {
  if (!vector3Pool) {
    vector3Pool = new Vector3Pool({
      initialSize: 50,
      maxSize: 500,
      growthFactor: 2,
    });
  }
  return vector3Pool;
};

export const getMemoryMonitor = (): MemoryMonitor => {
  if (!memoryMonitor) {
    memoryMonitor = new MemoryMonitor();
  }
  return memoryMonitor;
};

// Utility functions for easy access
export const getTempVector3 = (x: number = 0, y: number = 0, z: number = 0): THREE.Vector3 => {
  return getVector3Pool().getTempVector(x, y, z);
};

export const releaseTempVector3 = (vec: THREE.Vector3): void => {
  getVector3Pool().releaseTempVector(vec);
};

/**
 * Execute a function with a temporary vector that is automatically released.
 * Preferred over getTempVector3/releaseTempVector3 for safety.
 */
export const withTempVector3 = <R>(x: number, y: number, z: number, fn: (vec: THREE.Vector3) => R): R => {
  return getVector3Pool().withTempVector(x, y, z, fn);
};

// Performance stats
export const getObjectPoolingStats = () => {
  const stats: Record<string, PoolStats | MemoryStats> = {};

  if (meshPool) stats["meshPool"] = meshPool.getStats();
  if (particlePool) stats["particlePool"] = particlePool.getStats();
  if (vector3Pool) stats["vector3Pool"] = vector3Pool.getStats();
  if (memoryMonitor) stats["memory"] = memoryMonitor.getMemoryStats();

  return stats;
};

/**
 * Get a summary of pool health metrics for diagnostics.
 */
export const getPoolHealthSummary = (): {
  totalActive: number;
  totalAvailable: number;
  overallHitRate: number;
  memoryTrend: string;
  timeToCritical: number;
} => {
  const allStats = getObjectPoolingStats();
  let totalActive = 0;
  let totalAvailable = 0;
  let totalReused = 0;
  let totalCreated = 0;
  let memoryTrend = "stable";
  let timeToCritical = Infinity;

  for (const [key, s] of Object.entries(allStats)) {
    if (key === "memory") {
      const mem = s as MemoryStats;
      memoryTrend = mem.trend;
      timeToCritical = mem.timeToCriticalSec;
    } else {
      const pool = s as PoolStats;
      totalActive += pool.active;
      totalAvailable += pool.available;
      totalReused += pool.reused;
      totalCreated += pool.created;
    }
  }

  const overallHitRate = totalReused + totalCreated > 0
    ? (totalReused / (totalReused + totalCreated)) * 100
    : 0;

  return { totalActive, totalAvailable, overallHitRate, memoryTrend, timeToCritical };
};

/**
 * Proactively shrink all pools by disposing a fraction of available objects.
 * Called automatically on memory warnings.
 */
const shrinkPool = <T>(pool: ObjectPool<T>, fraction: number): void => {
  const poolStats = pool.getStats();
  const toRemove = Math.floor(poolStats.available * fraction);
  if (toRemove <= 0) return;

  // Release available objects by acquiring and immediately disposing them
  // This works because the pool's release logic will shrink when over threshold
  for (let i = 0; i < toRemove; i++) {
    try {
      const obj = pool.get();
      pool.release(obj);
    } catch {
      break;
    }
  }
};

export const shrinkAllPools = (fraction: number = 0.2): void => {
  if (meshPool) shrinkPool(meshPool, fraction);
  if (particlePool) shrinkPool(particlePool, fraction);
  if (vector3Pool) shrinkPool(vector3Pool, fraction);
  logger.log(`[ObjectPooling] Proactively shrunk pools by ${(fraction * 100).toFixed(0)}%`);
};

// Cleanup all pools
export const disposeAllPools = () => {
  if (meshPool) {
    meshPool.disposeAll();
    meshPool = null;
  }

  if (particlePool) {
    particlePool.disposeSharedResources();
    particlePool.disposeAll();
    particlePool = null;
  }

  if (vector3Pool) {
    vector3Pool.disposeAll();
    vector3Pool = null;
  }

  if (memoryMonitor) {
    memoryMonitor.stopMonitoring();
    memoryMonitor = null;
  }

  logger.log("[ObjectPooling] All pools disposed and monitoring stopped");
};

// Export classes for external use if needed, preserving legacy behavior
export { MemoryMonitor, MeshPool, ParticleSystemPool, Vector3Pool };
