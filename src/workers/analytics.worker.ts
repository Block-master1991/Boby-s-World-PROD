// Analytics and Performance Monitoring WebWorker
// Handles performance data processing and analytics in background

interface PerformanceEvent {
    type: 'metric' | 'error' | 'user_action' | 'game_event';
    timestamp: number;
    data: any;
    sessionId: string;
    userId?: string;
}

interface AnalyticsBatch {
    events: PerformanceEvent[];
    batchId: string;
    startTime: number;
    endTime: number;
}

class AnalyticsProcessor {
    private eventBuffer: PerformanceEvent[] = [];
    private batchSize = 50;
    private flushInterval = 30000; // 30 seconds
    private sessionId: string;
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.startPeriodicFlush();
    }

    // Add event to buffer
    addEvent(event: Omit<PerformanceEvent, 'timestamp' | 'sessionId'>): void {
        const fullEvent: PerformanceEvent = {
            ...event,
            timestamp: Date.now(),
            sessionId: this.sessionId,
        };

        this.eventBuffer.push(fullEvent);

        // Auto-flush if buffer is full
        if (this.eventBuffer.length >= this.batchSize) {
            this.flushEvents();
        }
    }

    // Process and aggregate performance metrics
    processMetrics(events: PerformanceEvent[]): any {
        const metrics = {
            fps: { samples: [], avg: 0, min: Infinity, max: 0 },
            loadTimes: { samples: [], avg: 0, p95: 0 },
            memoryUsage: { samples: [], avg: 0, peak: 0 },
            errors: { count: 0, types: {} as Record<string, number> },
            userActions: { count: 0, types: {} as Record<string, number> },
            gameEvents: { count: 0, types: {} as Record<string, number> },
        };

        events.forEach(event => {
            switch (event.type) {
                case 'metric':
                    this.processMetricEvent(event.data, metrics);
                    break;
                case 'error':
                    metrics.errors.count++;
                    const errorType = event.data.type || 'unknown';
                    metrics.errors.types[errorType] = (metrics.errors.types[errorType] || 0) + 1;
                    break;
                case 'user_action':
                    metrics.userActions.count++;
                    const actionType = event.data.action || 'unknown';
                    metrics.userActions.types[actionType] = (metrics.userActions.types[actionType] || 0) + 1;
                    break;
                case 'game_event':
                    metrics.gameEvents.count++;
                    const gameEventType = event.data.event || 'unknown';
                    metrics.gameEvents.types[gameEventType] = (metrics.gameEvents.types[gameEventType] || 0) + 1;
                    break;
            }
        });

        // Calculate aggregates
        this.calculateAggregates(metrics);

        return metrics;
    }

    private processMetricEvent(data: any, metrics: any): void {
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

    private calculateAggregates(metrics: any): void {
        // FPS aggregates
        if (metrics.fps.samples.length > 0) {
            metrics.fps.avg = metrics.fps.samples.reduce((a: number, b: number) => a + b, 0) / metrics.fps.samples.length;
        }

        // Load time aggregates
        if (metrics.loadTimes.samples.length > 0) {
            const sorted = metrics.loadTimes.samples.sort((a: number, b: number) => a - b);
            const p95Index = Math.floor(sorted.length * 0.95);
            metrics.loadTimes.avg = sorted.reduce((a: number, b: number) => a + b, 0) / sorted.length;
            metrics.loadTimes.p95 = sorted[p95Index];
        }

        // Memory aggregates
        if (metrics.memoryUsage.samples.length > 0) {
            metrics.memoryUsage.avg = metrics.memoryUsage.samples.reduce((a: number, b: number) => a + b, 0) / metrics.memoryUsage.samples.length;
        }
    }

    private async flushEvents(): Promise<void> {
        if (this.eventBuffer.length === 0) return;

        const batch: AnalyticsBatch = {
            events: [...this.eventBuffer],
            batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: this.eventBuffer[0]?.timestamp || Date.now(),
            endTime: Date.now(),
        };

        // Process the batch
        const processedData = this.processMetrics(batch.events);

        // Send to main thread for storage/transmission
        self.postMessage({
            type: 'ANALYTICS_BATCH_READY',
            batch,
            processedData,
        });

        // Clear buffer
        this.eventBuffer = [];
    }

    private startPeriodicFlush(): void {
        this.flushTimer = setInterval(() => {
            this.flushEvents();
        }, this.flushInterval);
    }

    // Get current stats
    getStats() {
        return {
            bufferedEvents: this.eventBuffer.length,
            batchSize: this.batchSize,
            flushInterval: this.flushInterval,
        };
    }

    // Force flush remaining events
    async forceFlush(): Promise<void> {
        await this.flushEvents();
    }

    dispose(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.eventBuffer = [];
    }
}

// Performance prediction and optimization
class PerformancePredictor {
    private performanceHistory: Array<{
        timestamp: number;
        fps: number;
        memoryUsage: number;
        drawCalls: number;
        qualitySettings: any;
    }> = [];

    private maxHistorySize = 100;

    // Record performance snapshot
    recordPerformanceSnapshot(snapshot: {
        fps: number;
        memoryUsage: number;
        drawCalls: number;
        qualitySettings: any;
    }): void {
        this.performanceHistory.push({
            timestamp: Date.now(),
            ...snapshot,
        });

        if (this.performanceHistory.length > this.maxHistorySize) {
            this.performanceHistory.shift();
        }
    }

    // Predict optimal quality settings
    predictOptimalSettings(currentConditions: {
        deviceType: 'mobile' | 'desktop';
        batteryLevel?: number;
        networkType?: string;
    }): any {
        if (this.performanceHistory.length < 5) {
            // Not enough data, return conservative defaults
            return this.getConservativeDefaults(currentConditions.deviceType);
        }

        // Analyze recent performance
        const recentHistory = this.performanceHistory.slice(-10);
        const avgFps = recentHistory.reduce((sum, h) => sum + h.fps, 0) / recentHistory.length;
        const avgMemory = recentHistory.reduce((sum, h) => sum + h.memoryUsage, 0) / recentHistory.length;

        // Predict based on device type and performance
        return this.calculateOptimalSettings(avgFps, avgMemory, currentConditions);
    }

    private getConservativeDefaults(deviceType: 'mobile' | 'desktop'): any {
        if (deviceType === 'mobile') {
            return {
                lodDistance: 25,
                shadowQuality: 0.5,
                particleCount: 50,
                textureQuality: 0.7,
                antialias: false,
            };
        } else {
            return {
                lodDistance: 50,
                shadowQuality: 0.8,
                particleCount: 100,
                textureQuality: 1.0,
                antialias: true,
            };
        }
    }

    private calculateOptimalSettings(avgFps: number, avgMemory: number, conditions: any): any {
        const settings = { ...this.getConservativeDefaults(conditions.deviceType) };

        // Adjust based on FPS
        if (avgFps > 50) {
            settings.lodDistance *= 1.5;
            settings.particleCount *= 1.5;
        } else if (avgFps < 30) {
            settings.lodDistance *= 0.7;
            settings.particleCount *= 0.5;
            settings.shadowQuality *= 0.5;
        }

        // Adjust based on memory
        const memoryMB = avgMemory / (1024 * 1024);
        if (memoryMB > 200) {
            settings.textureQuality *= 0.8;
        } else if (memoryMB < 100) {
            settings.textureQuality = Math.min(1.0, settings.textureQuality * 1.2);
        }

        // Device-specific adjustments
        if (conditions.deviceType === 'mobile') {
            if (conditions.batteryLevel && conditions.batteryLevel < 20) {
                settings.lodDistance *= 0.8;
                settings.particleCount *= 0.5;
            }
        }

        return settings;
    }
}

// Main worker logic
let analyticsProcessor: AnalyticsProcessor | null = null;
let performancePredictor: PerformancePredictor | null = null;

// Message handler
self.onmessage = async (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'INIT_ANALYTICS':
            analyticsProcessor = new AnalyticsProcessor(data.sessionId);
            performancePredictor = new PerformancePredictor();
            self.postMessage({ type: 'ANALYTICS_INITIALIZED' });
            break;

        case 'ADD_EVENT':
            if (analyticsProcessor) {
                analyticsProcessor.addEvent(data.event);
            }
            break;

        case 'RECORD_PERFORMANCE':
            if (performancePredictor) {
                performancePredictor.recordPerformanceSnapshot(data.snapshot);
            }
            break;

        case 'PREDICT_SETTINGS':
            if (performancePredictor) {
                const optimalSettings = performancePredictor.predictOptimalSettings(data.conditions);
                self.postMessage({
                    type: 'OPTIMAL_SETTINGS_PREDICTED',
                    settings: optimalSettings
                });
            }
            break;

        case 'GET_STATS':
            const stats = {
                analytics: analyticsProcessor?.getStats(),
                performanceHistory: performancePredictor ?
                    `History size: ${performancePredictor['performanceHistory'].length}` : 'No data',
            };
            self.postMessage({ type: 'STATS_RESPONSE', stats });
            break;

        case 'FORCE_FLUSH':
            if (analyticsProcessor) {
                await analyticsProcessor.forceFlush();
                self.postMessage({ type: 'FLUSH_COMPLETED' });
            }
            break;

        case 'DISPOSE':
            if (analyticsProcessor) {
                analyticsProcessor.dispose();
                analyticsProcessor = null;
            }
            performancePredictor = null;
            self.postMessage({ type: 'DISPOSED' });
            break;

        default:
            console.warn(`[AnalyticsWorker] Unknown message type: ${type}`);
    }
};

// Periodic status updates
setInterval(() => {
    if (analyticsProcessor) {
        self.postMessage({
            type: 'STATUS_UPDATE',
            bufferedEvents: analyticsProcessor.getStats().bufferedEvents,
        });
    }
}, 10000); // Every 10 seconds
