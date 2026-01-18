export interface PoolConfig {
    initialSize: number;
    maxSize: number;
    growthFactor: number;
    shrinkThreshold: number;
    cleanupInterval: number; // ms
}

export interface PoolStats {
    active: number;
    available: number;
    total: number;
    created: number;
    reused: number;
    disposed: number;
    peakUsage: number;
    hitRate: number;
}
