import { contextManager } from "../core/LogContext";
import { professionalLogger } from "../index";

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: "ms" | "ns" | "bytes" | "percent" | "count";
  tags?: Record<string, string>;
  timestamp: number;
}

export interface PerformanceThresholds {
  warn: number;
  critical: number;
}

export interface PerformanceLoggerConfig {
  enabled: boolean;
  slowRequestThreshold: number; // ms
  slowQueryThreshold: number; // ms
  memoryWarningThreshold: number; // bytes
  autoHeapStats: boolean; // Automatically log heap usage
}

interface LogMetricOptions {
  metadata?: Record<string, unknown> | undefined;
  thresholds?: PerformanceThresholds | undefined;
}

type GlobalWithProcess = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

const getEnv = (key: string): string | undefined => {
  try {
    if (typeof process !== "undefined" && process.env) return process.env[key];
    const g = globalThis as GlobalWithProcess;
    if (typeof globalThis !== "undefined" && g.process?.env)
      return g.process.env[key];
  } catch {
    /* ignore */
  }
  return undefined;
};

const DEFAULT_CONFIG: PerformanceLoggerConfig = {
  enabled: true,
  slowRequestThreshold: 1000,
  slowQueryThreshold: 500,
  memoryWarningThreshold: 500 * 1024 * 1024, // 500 MB
  autoHeapStats: getEnv("NODE_ENV") === "production",
};

/**
 * Performance Logger - High Precision Performance Monitoring
 */
export class PerformanceLogger {
  private static instance: PerformanceLogger;
  private config: PerformanceLoggerConfig;
  private timers: Map<string, number> = new Map();

  private constructor(config: Partial<PerformanceLoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public static getInstance(config?: Partial<PerformanceLoggerConfig>): PerformanceLogger {
    if (!PerformanceLogger.instance) {
      PerformanceLogger.instance = new PerformanceLogger(config);
    }
    return PerformanceLogger.instance;
  }

  /**
   * Start a timer
   */
  startTimer(label: string): void {
    if (!this.config.enabled) return;
    this.timers.set(label, performance.now());
  }

  /**
   * Stop timer and log duration
   */
  endTimer(
    label: string,
    metadata: Record<string, unknown> = {},
    thresholds?: PerformanceThresholds
  ): number {
    if (!this.config.enabled) return 0;

    const startTime = this.timers.get(label);
    if (!startTime) {
      professionalLogger.warn(`Performance timer '${label}' ended without starting`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    this.logMetric(label, duration, "ms", { metadata, thresholds });
    return duration;
  }

  /**
   * Measure execution time of a function wrapper
   */
  async measure<T>(
    label: string,
    fn: () => Promise<T> | T,
    metadata: Record<string, unknown> = {},
    thresholds?: PerformanceThresholds
  ): Promise<T> {
    if (!this.config.enabled) return fn();

    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.logMetric(label, duration, "ms", { metadata, thresholds });
    }
  }

  /**
   * Log a performance metric
   */
  logMetric(
    name: string,
    value: number,
    unit: PerformanceMetric["unit"],
    options: LogMetricOptions = {}
  ): void {
    if (!this.config.enabled) return;

    const { metadata = {}, thresholds } = options;

    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      tags: {
        ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])),
        correlationId: contextManager.getCurrentContext()?.correlationId || "unknown",
      },
      timestamp: Date.now(),
    };

    let level: "info" | "warn" | "error" = "info";

    if (thresholds) {
      if (value >= thresholds.critical) {
        level = "error";
      } else if (value >= thresholds.warn) {
        level = "warn";
      }
    } else if (unit === "ms") {
      if (name.includes("db") || name.includes("query")) {
        if (value >= this.config.slowQueryThreshold) level = "warn";
      } else if (value >= this.config.slowRequestThreshold) {
        level = "warn";
      }
    }

    professionalLogger[level](`Performance: ${name} took ${value.toFixed(2)}${unit}`, {
      performance: true,
      metric,
      ...metadata,
    });
  }

  /**
   * Log System Resource Usage (Memory/CPU)
   */
  logResourceUsage(): void {
    const hasProcessMemory =
      typeof process !== "undefined" && typeof process.memoryUsage === "function";

    if (!this.config.enabled || !hasProcessMemory) return;

    const memUsage = process.memoryUsage();

    // Log Heap Used
    this.logMetric("memory_heap_used", memUsage.heapUsed, "bytes", {
      thresholds: {
        warn: this.config.memoryWarningThreshold,
        critical: this.config.memoryWarningThreshold * 1.5,
      },
    });

    // Log RSS
    this.logMetric("memory_rss", memUsage.rss, "bytes");

    // CPU Usage (basic load avg)
    try {
      if (typeof window === "undefined") {
        // Use eval to prevent Webpack from bundling 'node:os' for Edge Runtime
        // eslint-disable-next-line no-eval
        const os = eval('require("node:os")');
        if (os && typeof os.loadavg === "function") {
          const load = os.loadavg() as number[];
          if (load[0] !== undefined) {
            this.logMetric("cpu_load_1m", load[0], "count");
          }
        }
      }
    } catch {
      // Ignore if os module not available
    }
  }
}

export const performanceLogger = PerformanceLogger.getInstance();
