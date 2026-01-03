// Advanced Object Pooling System for Memory Optimization
// Reuses objects instead of creating/destroying them frequently

import { THREE, Mesh, Points, Vector3, BufferGeometry, MeshStandardMaterial, PointsMaterial, BufferAttribute } from '@/lib/three-chunk';
import { isMobileDevice } from './utils';
import { logger } from '@/utils/logger';

interface PoolConfig {
    initialSize: number;
    maxSize: number;
    growthFactor: number;
    shrinkThreshold: number;
    cleanupInterval: number; // ms
}

interface PoolStats {
    active: number;
    available: number;
    total: number;
    created: number;
    reused: number;
    disposed: number;
    peakUsage: number;
    hitRate: number;
}

abstract class ObjectPool<T> {
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
                logger.warn(`[ObjectPool] Pool full, created additional object. Active: ${this.active.size}`);
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
            logger.warn('[ObjectPool] Attempted to release object not in active pool');
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
        if (totalObjects > this.config.initialSize &&
            this.available.length / totalObjects > this.config.shrinkThreshold) {
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
        const hitRate = (this.stats.reused + this.stats.created) > 0 ?
            (this.stats.reused / (this.stats.reused + this.stats.created)) * 100 : 0;

        logger.log(`[ObjectPool] Cleanup - Active: ${this.active.size}, Available: ${this.available.length}, Hit Rate: ${hitRate.toFixed(1)}%`);
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

        logger.log(`[ObjectPool] Disposed all objects. Total disposed: ${this.stats.disposed + this.active.size + this.available.length}`);
    }
}

// Three.js Object Pool for Meshes
class MeshPool extends ObjectPool<THREE.Mesh> {
    private geometry: THREE.BufferGeometry;
    private material: THREE.Material;

    constructor(geometry: THREE.BufferGeometry, material: THREE.Material, config?: Partial<PoolConfig>) {
        super(config);
        this.geometry = geometry;
        this.material = material;
    }

    protected create(): THREE.Mesh {
        return new THREE.Mesh(this.geometry.clone(), this.material.clone());
    }

    protected reset(obj: THREE.Mesh): void {
        obj.position.set(0, 0, 0);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(1, 1, 1);
        obj.visible = true;

        // Reset material properties
        if (obj.material instanceof THREE.MeshStandardMaterial) {
            obj.material.emissive.setHex(0x000000);
            obj.material.opacity = 1.0;
            obj.material.transparent = false;
        }
    }

    protected dispose(obj: THREE.Mesh): void {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => {
                    if (mat && typeof mat.dispose === 'function') {
                        mat.dispose();
                    }
                });
            } else if (obj.material && typeof (obj.material as any).dispose === 'function') {
                (obj.material as any).dispose();
            }
        }
    }

    protected isValid(obj: THREE.Mesh): boolean {
        return obj.geometry !== null && obj.material !== null;
    }
}

// Particle System Pool
class ParticleSystemPool extends ObjectPool<THREE.Points> {
    private maxParticles: number;

    constructor(maxParticles: number = 100, config?: Partial<PoolConfig>) {
        super(config);
        this.maxParticles = maxParticles;
    }

    protected create(): THREE.Points {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.maxParticles * 3);
        const colors = new Float32Array(this.maxParticles * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Points(geometry, material);
    }

    protected reset(obj: THREE.Points): void {
        obj.position.set(0, 0, 0);
        obj.visible = false;

        // Reset particle positions
        const positions = obj.geometry.attributes.position.array as Float32Array;
        const colors = obj.geometry.attributes.color.array as Float32Array;

        positions.fill(0);
        colors.fill(0);

        obj.geometry.attributes.position.needsUpdate = true;
        obj.geometry.attributes.color.needsUpdate = true;
    }

    protected dispose(obj: THREE.Points): void {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && typeof (obj.material as any).dispose === 'function') {
            (obj.material as any).dispose();
        }
    }

    protected isValid(obj: THREE.Points): boolean {
        return obj.geometry !== null && obj.material !== null;
    }
}

// Vector3 Pool for temporary calculations
class Vector3Pool extends ObjectPool<THREE.Vector3> {
    protected create(): THREE.Vector3 {
        return new THREE.Vector3();
    }

    protected reset(obj: THREE.Vector3): void {
        obj.set(0, 0, 0);
    }

    protected dispose(obj: THREE.Vector3): void {
        // Vector3 doesn't need disposal
    }

    protected isValid(obj: THREE.Vector3): boolean {
        return true;
    }

    // Utility methods for vector operations
    getTempVector(x: number = 0, y: number = 0, z: number = 0): THREE.Vector3 {
        const vec = this.get();
        vec.set(x, y, z);
        return vec;
    }

    releaseTempVector(vec: THREE.Vector3): void {
        this.release(vec);
    }
}

// Memory Monitor for tracking overall memory usage
class MemoryMonitor {
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
        if ('memory' in performance) {
            const mem = (performance as any).memory;
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
            (window as any).gc();
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
    const stats: any = {};

    if (meshPool) stats.meshPool = meshPool.getStats();
    if (particlePool) stats.particlePool = particlePool.getStats();
    if (vector3Pool) stats.vector3Pool = vector3Pool.getStats();
    if (memoryMonitor) stats.memory = memoryMonitor.getMemoryStats();

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
