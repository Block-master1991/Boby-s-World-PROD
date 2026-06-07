export interface PoolConfig {
  initialSize: number;
  maxSize: number;
  growthFactor: number;
  shrinkThreshold: number;
  cleanupInterval: number; // ms
  /** Minimum ratio of available objects to keep (0-1). Default: 0.1 */
  minAvailableRatio?: number;
  /** Maximum idle time (ms) before an available object is evicted. Default: 120000 */
  maxIdleTime?: number;
  /** Whether to pre-warm the pool on construction. Default: true */
  preWarm?: boolean;
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
  /** Average time (ms) an object spends in active use */
  avgHoldTimeMs: number;
  /** Number of times the pool had to grow beyond its current size */
  growCount: number;
  /** Number of times the pool shrank by evicting idle objects */
  shrinkCount: number;
  /** Timestamp of the last cleanup cycle */
  lastCleanupTime: number;
}

export interface MemoryStats {
  current: string;
  average: string;
  peak: string;
  warningThreshold: string;
  criticalThreshold: string;
  /** Trend direction: "increasing" | "stable" | "decreasing" | "stale" */
  trend: string;
  /** Growth rate in bytes/second over the last monitoring window */
  growthRateBytesPerSec: number;
  /** Time in seconds until critical threshold at current growth rate, or Infinity */
  timeToCriticalSec: number;
  /** Number of emergency cleanups triggered */
  emergencyCleanups: number;
  /** Number of early warnings triggered */
  earlyWarnings: number;
  /** Last recorded memory usage (formatted) */
  lastRecordedUsed: string;
  /** Delta between current and last recorded usage (formatted) */
  usedDeltaSinceLast: string;
  /** Milliseconds since last trend computation; -1 if never computed */
  monitoringStalenessMs: number;
}

export interface MemoryThresholdConfig {
  /** Warning threshold in bytes */
  warning: number;
  /** Critical threshold in bytes */
  critical: number;
  /** Early warning ratio (0-1) – triggers when usage reaches this fraction of warning. Default: 0.8 */
  earlyWarningRatio: number;
  /** How often (ms) to re-evaluate thresholds dynamically. Default: 30000 */
  dynamicReevaluationInterval: number;
}
