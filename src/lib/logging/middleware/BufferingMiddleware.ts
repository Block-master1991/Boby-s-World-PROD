/**
 * Buffering Middleware - Log Batching for Performance
 * Buffers logs in memory and flushes in batches for improved performance
 */

import { isProd } from "../../config/env";
import { professionalLogger } from "../index";

export interface BufferingConfig {
  enabled: boolean;
  maxSize?: number; // Maximum buffer size before auto-flush
  flushInterval?: number; // Auto-flush interval in ms
  flushOnCritical?: boolean; // Immediately flush on critical logs
  maxMemory?: number; // Maximum memory usage in bytes
}

const DEFAULT_CONFIG: BufferingConfig = {
  enabled: true,
  maxSize: 100,
  flushInterval: 5000, // 5 seconds
  flushOnCritical: true,
  maxMemory: 10 * 1024 * 1024, // 10 MB
};

/**
 * Log entry for buffering
 */
export interface BufferedLogEntry {
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
}

/**
 * Flush callback type
 */
export type FlushCallback = (logs: BufferedLogEntry[]) => Promise<void> | void;

/**
 * Buffering Middleware Class
 */
export class BufferingMiddleware {
  private config: BufferingConfig;
  private buffer: BufferedLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | number | null = null;
  private flushCallbacks: FlushCallback[] = [];
  private currentMemoryUsage: number = 0;
  private isFlushing: boolean = false;

  constructor(config: Partial<BufferingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled && this.config.flushInterval) {
      this.startFlushTimer();
    }
  }

  /**
   * Add log entry to buffer
   */
  async add(entry: BufferedLogEntry): Promise<void> {
    if (!this.config.enabled) {
      // If buffering disabled, flush immediately
      await this.flushCallbacks.forEach(cb => cb([entry]));
      return;
    }

    // Estimate memory usage
    const entrySize = this.estimateSize(entry);
    this.currentMemoryUsage += entrySize;

    // Add to buffer
    this.buffer.push(entry);

    // Check if we need to flush
    const shouldFlush =
      this.buffer.length >= this.config.maxSize! ||
      this.currentMemoryUsage >= this.config.maxMemory! ||
      (this.config.flushOnCritical && this.isCriticalLevel(entry.level));

    if (shouldFlush) {
      await this.flush();
    }
  }

  /**
   * Register flush callback
   */
  onFlush(callback: FlushCallback): void {
    this.flushCallbacks.push(callback);
  }

  /**
   * Flush all buffered logs
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      // Get logs to flush
      const logsToFlush = [...this.buffer];

      // Clear buffer immediately
      this.buffer = [];
      this.currentMemoryUsage = 0;

      // Call all flush callbacks
      await Promise.all(
        this.flushCallbacks.map(callback => Promise.resolve(callback(logsToFlush)))
      );
    } catch (error) {
      professionalLogger.error("[BufferingMiddleware] Flush failed", error);

      // On error, try to preserve logs
      // In production, these should go to a dead letter queue
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.config.flushInterval!);

    // Don't keep process alive
    if (this.flushTimer && typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Estimate memory size of log entry
   */
  private estimateSize(entry: BufferedLogEntry): number {
    // Rough estimation in bytes
    const messageSize = entry.message.length * 2; // UTF-16
    const metadataSize = entry.metadata ? JSON.stringify(entry.metadata).length * 2 : 0;
    const overhead = 100; // Object overhead

    return messageSize + metadataSize + overhead;
  }

  /**
   * Check if log level is critical
   */
  private isCriticalLevel(level: string): boolean {
    const criticalLevels = ["error", "fatal", "critical"];
    return criticalLevels.includes(level.toLowerCase());
  }

  /**
   * Get current buffer stats
   */
  getStats(): {
    bufferSize: number;
    memoryUsage: number;
    maxSize: number;
    maxMemory: number;
  } {
    return {
      bufferSize: this.buffer.length,
      memoryUsage: this.currentMemoryUsage,
      maxSize: this.config.maxSize!,
      maxMemory: this.config.maxMemory!,
    };
  }

  /**
   * Clear buffer without flushing
   */
  clear(): void {
    this.buffer = [];
    this.currentMemoryUsage = 0;
  }

  /**
   * Destroy and cleanup
   */
  async destroy(): Promise<void> {
    this.stopFlushTimer();

    // Final flush
    if (this.buffer.length > 0) {
      await this.flush();
    }

    this.flushCallbacks = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BufferingConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Restart timer if interval changed
    if (this.config.enabled && this.config.flushInterval) {
      this.startFlushTimer();
    } else if (!this.config.enabled) {
      this.stopFlushTimer();
    }

    // Flush if disabling
    if (wasEnabled && !this.config.enabled && this.buffer.length > 0) {
      this.flush();
    }
  }

  /**
   * Wait for all pending flushes to complete
   */
  async waitForFlush(): Promise<void> {
    while (this.isFlushing) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (this.buffer.length > 0) await this.flush();
  }
}

export const bufferingMiddleware = new BufferingMiddleware({
  enabled: isProd,
  maxSize: 100,
  flushInterval: 5000,
  flushOnCritical: true,
  maxMemory: 10 * 1024 * 1024,
});

export function createBuffering(config?: Partial<BufferingConfig>): BufferingMiddleware {
  return new BufferingMiddleware(config);
}

// Cleanup on process exit - Only runs in Node.js environment
try {
  const isNode = typeof process !== "undefined" && !!process.versions?.node;
  if (isNode) {
    const nodeProcess = globalThis.process;
    if (nodeProcess && typeof nodeProcess.on === "function") {
      const cleanup = async () => {
        await bufferingMiddleware.destroy();
      };
      nodeProcess.on("beforeExit", cleanup);
      nodeProcess.on("SIGTERM", async () => {
        await cleanup();
        nodeProcess.exit(0);
      });
      nodeProcess.on("SIGINT", async () => {
        await cleanup();
        nodeProcess.exit(0);
      });
    }
  }
} catch {
  /* Silently fail in non-Node environments */
}
