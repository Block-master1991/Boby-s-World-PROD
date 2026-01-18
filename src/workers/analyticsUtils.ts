/**
 * Types and Utilities for Analytics Worker
 */

export type MetricData = {
    fps?: number;
    loadTime?: number;
    memoryUsage?: number;
};

export type ErrorData = {
    type?: string;
};

export type UserActionData = {
    action?: string;
};

export type GameEventData = {
    event?: string;
};

export type PerformanceEvent =
  | {
      type: 'metric';
      timestamp: number;
      data: MetricData;
      sessionId: string;
      userId?: string;
    }
  | {
      type: 'error';
      timestamp: number;
      data: ErrorData;
      sessionId: string;
      userId?: string;
    }
  | {
      type: 'user_action';
      timestamp: number;
      data: UserActionData;
      sessionId: string;
      userId?: string;
    }
  | {
      type: 'game_event';
      timestamp: number;
      data: GameEventData;
      sessionId: string;
      userId?: string;
    };

export interface ProcessedMetrics {
    fps: { samples: number[]; avg: number; min: number; max: number };
    loadTimes: { samples: number[]; avg: number; p95: number };
    memoryUsage: { samples: number[]; avg: number; peak: number };
    errors: { count: number; types: Record<string, number> };
    userActions: { count: number; types: Record<string, number> };
    gameEvents: { count: number; types: Record<string, number> };
}

export interface QualitySettings {
    lodDistance: number;
    shadowQuality: number;
    particleCount: number;
    textureQuality: number;
    antialias: boolean;
}

export interface CurrentConditions {
    deviceType: 'mobile' | 'desktop';
    batteryLevel?: number;
    networkType?: string;
}

export type PerformanceEventInput =
  | {
      type: 'metric';
      data: MetricData;
      userId?: string;
    }
  | {
      type: 'error';
      data: ErrorData;
      userId?: string;
    }
  | {
      type: 'user_action';
      data: UserActionData;
      userId?: string;
    }
  | {
      type: 'game_event';
      data: GameEventData;
      userId?: string;
    };

export interface AnalyticsBatch {
    events: PerformanceEvent[];
    batchId: string;
    startTime: number;
    endTime: number;
}

// Performance prediction and optimization
export class PerformancePredictor {
    private performanceHistory: Array<{
        timestamp: number;
        fps: number;
        memoryUsage: number;
        drawCalls: number;
        qualitySettings: QualitySettings;
    }> = [];

    private maxHistorySize = 100;

    // Record performance snapshot
    recordPerformanceSnapshot(snapshot: {
        fps: number;
        memoryUsage: number;
        drawCalls: number;
        qualitySettings: QualitySettings;
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
    predictOptimalSettings(currentConditions: CurrentConditions): QualitySettings {
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

    private getConservativeDefaults(deviceType: 'mobile' | 'desktop'): QualitySettings {
        if (deviceType === 'mobile') {
            return {
                lodDistance: 25,
                shadowQuality: 0.5,
                particleCount: 50,
                textureQuality: 0.7,
                antialias: false,
            };
        } 
        return {
            lodDistance: 50,
            shadowQuality: 0.8,
            particleCount: 100,
            textureQuality: 1.0,
            antialias: true,
        };
    }

    private calculateOptimalSettings(avgFps: number, avgMemory: number, conditions: CurrentConditions): QualitySettings {
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
        if (conditions.deviceType === 'mobile' && conditions.batteryLevel && conditions.batteryLevel < 20) {
            settings.lodDistance *= 0.8;
            settings.particleCount *= 0.5;
        }

        return settings;
    }

    // Explicitly expose for metrics
    getHistoryCount(): number {
        return this.performanceHistory.length;
    }
}
