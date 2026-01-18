// Advanced Object Pooling System for Memory Optimization
// Reuses objects instead of creating/destroying them frequently

import type { THREE } from '@/lib/three-chunk';
import { logger } from '@/utils/logger';
import { MemoryMonitor } from './pooling/MemoryMonitor';
import { MeshPool } from './pooling/MeshPool';
import { ParticleSystemPool } from './pooling/ParticleSystemPool';
import { Vector3Pool } from './pooling/Vector3Pool';

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

    logger.log('[ObjectPooling] Initialized memory monitor and vector pool');
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

// Performance stats
export const getObjectPoolingStats = () => {
    // Use proper typing instead of 'any'
    const stats: Record<string, unknown> = {};

    if (meshPool) stats['meshPool'] = meshPool.getStats();
    if (particlePool) stats['particlePool'] = particlePool.getStats();
    if (vector3Pool) stats['vector3Pool'] = vector3Pool.getStats();
    if (memoryMonitor) stats['memory'] = memoryMonitor.getMemoryStats();

    return stats;
};

// Cleanup all pools
export const disposeAllPools = () => {
    if (meshPool) {
        meshPool.disposeAll();
        meshPool = null;
    }

    if (particlePool) {
        particlePool.disposeAll();
        particlePool = null;
    }

    if (vector3Pool) {
        vector3Pool.disposeAll();
        vector3Pool = null;
    }

    logger.log('[ObjectPooling] All pools disposed');
};

// Export classes for external use if needed, preserving legacy behavior
export { MemoryMonitor, MeshPool, ParticleSystemPool, Vector3Pool };

