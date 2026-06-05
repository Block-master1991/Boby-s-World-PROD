// Analytics and Performance Monitoring WebWorker
// Handles performance data processing and analytics in background

/// <reference lib="webworker" />

import { logger } from "utils/logger";
import {
  PerformancePredictor,
  type AnalyticsBatch,
  type CurrentConditions,
  type MetricData,
  type PerformanceEvent,
  type PerformanceEventInput,
  type ProcessedMetrics,
  type QualitySettings,
} from "./analyticsUtils";

// --- Analytics Processor Class ---

class AnalyticsProcessor {
  private eventBuffer: PerformanceEvent[] = [];
  private batchSize = 50;
  private flushInterval = 30000; // 30 seconds
  private sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startPeriodicFlush();
  }

  // Add event to buffer
  addEvent(event: PerformanceEventInput): void {
    const fullEvent: PerformanceEvent = {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    } as PerformanceEvent;

    this.eventBuffer.push(fullEvent);

    if (this.eventBuffer.length >= this.batchSize) {
      this.flushEvents();
    }
  }

  // Process and aggregate performance metrics
  processMetrics(events: PerformanceEvent[]): ProcessedMetrics {
    const metrics: ProcessedMetrics = {
      fps: { samples: [], avg: 0, min: Infinity, max: 0 },
      loadTimes: { samples: [], avg: 0, p95: 0 },
      memoryUsage: { samples: [], avg: 0, peak: 0 },
      errors: { count: 0, types: {} },
      userActions: { count: 0, types: {} },
      gameEvents: { count: 0, types: {} },
    };

    events.forEach(event => {
      switch (event.type) {
        case "metric":
          this.processMetricEvent(event.data, metrics);
          break;
        case "error": {
          metrics.errors.count++;
          const errorType = event.data.type || "unknown";
          metrics.errors.types[errorType] = (metrics.errors.types[errorType] || 0) + 1;
          break;
        }
        case "user_action": {
          metrics.userActions.count++;
          const actionType = event.data.action || "unknown";
          metrics.userActions.types[actionType] = (metrics.userActions.types[actionType] || 0) + 1;
          break;
        }
        case "game_event": {
          metrics.gameEvents.count++;
          const gameEventType = event.data.event || "unknown";
          metrics.gameEvents.types[gameEventType] =
            (metrics.gameEvents.types[gameEventType] || 0) + 1;
          break;
        }
      }
    });

    this.calculateAggregates(metrics);
    return metrics;
  }

  private processMetricEvent(data: MetricData, metrics: ProcessedMetrics): void {
    if (data.fps !== undefined) {
      metrics.fps.samples.push(data.fps);
      metrics.fps.min = Math.min(metrics.fps.min, data.fps);
      metrics.fps.max = Math.max(metrics.fps.max, data.fps);
    }

    if (data.loadTime !== undefined) {
      metrics.loadTimes.samples.push(data.loadTime);
    }

    if (data.memoryUsage !== undefined) {
      metrics.memoryUsage.samples.push(data.memoryUsage);
      metrics.memoryUsage.peak = Math.max(metrics.memoryUsage.peak, data.memoryUsage);
    }
  }

  private calculateAggregates(metrics: ProcessedMetrics): void {
    const calculateAvg = (samples: number[]) =>
      samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;

    metrics.fps.avg = calculateAvg(metrics.fps.samples);
    metrics.memoryUsage.avg = calculateAvg(metrics.memoryUsage.samples);

    if (metrics.loadTimes.samples.length > 0) {
      const sorted = [...metrics.loadTimes.samples].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      metrics.loadTimes.avg = calculateAvg(sorted);
      metrics.loadTimes.p95 = sorted[p95Index] ?? 0;
    }
  }

  flushEvents(): void {
    if (this.eventBuffer.length === 0) return;

    const batch: AnalyticsBatch = {
      events: [...this.eventBuffer],
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      startTime: this.eventBuffer[0]?.timestamp || Date.now(),
      endTime: Date.now(),
    };

    const processedData = this.processMetrics(batch.events);

    self.postMessage({
      type: "ANALYTICS_BATCH_READY",
      batch,
      processedData,
    });

    this.eventBuffer = [];
  }

  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flushEvents();
    }, this.flushInterval);
  }

  getStats() {
    return {
      bufferedEvents: this.eventBuffer.length,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval,
    };
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.eventBuffer = [];
  }
}

// --- Main Worker Initialization ---

let analyticsProcessor: AnalyticsProcessor | null = null;
let performancePredictor: PerformancePredictor | null = null;

// --- Message Handlers ---

interface HandlerData {
  sessionId?: string;
  event?: PerformanceEventInput;
  snapshot?: {
    fps: number;
    memoryUsage: number;
    drawCalls: number;
    qualitySettings: QualitySettings;
  };
  conditions?: CurrentConditions;
}

const handlers: Record<string, (data: HandlerData) => Promise<void> | void> = {
  INIT_ANALYTICS: data => {
    if (data.sessionId) {
      analyticsProcessor = new AnalyticsProcessor(data.sessionId);
      performancePredictor = new PerformancePredictor();
      self.postMessage({ type: "ANALYTICS_INITIALIZED" });
    }
  },
  ADD_EVENT: data => {
    if (data.event) {
      analyticsProcessor?.addEvent(data.event);
    }
  },
  RECORD_PERFORMANCE: data => {
    if (data.snapshot) {
      performancePredictor?.recordPerformanceSnapshot(data.snapshot);
    }
  },
  PREDICT_SETTINGS: data => {
    if (performancePredictor && data.conditions) {
      const settings = performancePredictor.predictOptimalSettings(data.conditions);
      self.postMessage({ type: "OPTIMAL_SETTINGS_PREDICTED", settings });
    }
  },
  GET_STATS: () => {
    const stats = {
      analytics: analyticsProcessor?.getStats(),
      performanceHistory: performancePredictor
        ? `History size: ${performancePredictor.getHistoryCount()}`
        : "No data",
    };
    self.postMessage({ type: "STATS_RESPONSE", stats });
  },
  FORCE_FLUSH: () => {
    analyticsProcessor?.flushEvents();
    self.postMessage({ type: "FLUSH_COMPLETED" });
  },
  DISPOSE: () => {
    analyticsProcessor?.dispose();
    analyticsProcessor = null;
    performancePredictor = null;
    self.postMessage({ type: "DISPOSED" });
  },
};

self.onmessage = async event => {
  const { type, data } = event.data;
  const handler = handlers[type];

  if (handler) {
    try {
      await handler(data as HandlerData);
    } catch (error) {
      logger.error(`[AnalyticsWorker] Error handling ${type}:`, error);
    }
  } else {
    logger.warn(`[AnalyticsWorker] Unknown message type: ${type}`);
  }
};

// Periodic status updates
setInterval(() => {
  if (analyticsProcessor) {
    self.postMessage({
      type: "STATUS_UPDATE",
      bufferedEvents: analyticsProcessor.getStats().bufferedEvents,
    });
  }
}, 10000);
