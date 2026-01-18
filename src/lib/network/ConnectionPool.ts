// Connection Pooling Manager for Optimized Network Requests
import { logger } from '@/utils/logger';
import type { ActiveConnection, ConnectionConfig, PoolStats, QueuedRequest } from './types';

export class ConnectionPool {
    private config: ConnectionConfig;
    private activeConnections = new Map<string, ActiveConnection>();
    private requestQueue: QueuedRequest[] = [];
    private circuitBreakerFailures = 0;
    private circuitBreakerLastFailure = 0;
    private isCircuitBreakerOpen = false;

    constructor(config: Partial<ConnectionConfig> = {}) {
        this.config = {
            maxConnections: 6,
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000,
            ...config,
        };
    }

    // Enhanced fetch with connection pooling
    fetch(url: string, options: RequestInit = {}, priority = 1): Promise<Response> {
        // Check circuit breaker
        if (this.isCircuitBreakerOpen) {
            if (Date.now() - this.circuitBreakerLastFailure < this.config.circuitBreakerTimeout) {
                return Promise.reject(new Error('Circuit breaker is open - too many failures'));
            }
            this.isCircuitBreakerOpen = false;
            this.circuitBreakerFailures = 0;
        }

        return new Promise((resolve, reject) => {
            const request: QueuedRequest = {
                id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                url, options, resolve, reject, priority,
                timestamp: Date.now(),
                retryCount: 0,
            };

            this.requestQueue.push(request);
            this.requestQueue.sort((a, b) => a.priority - b.priority);
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.activeConnections.size >= this.config.maxConnections || this.isCircuitBreakerOpen) {
            return;
        }

        const nextRequest = this.requestQueue.shift();
        if (!nextRequest) return;

        if (this.activeConnections.size >= this.config.maxConnections) {
            this.requestQueue.unshift(nextRequest);
            return;
        }

        await this.executeRequest(nextRequest);
    }

    private async executeRequest(request: QueuedRequest): Promise<void> {
        const controller = new AbortController();
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.activeConnections.set(connectionId, {
            id: connectionId,
            url: request.url,
            controller,
            startTime: Date.now(),
        });

        try {
            const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
            const response = await fetch(request.url, {
                ...request.options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            request.resolve(response);
            this.circuitBreakerFailures = 0;
        } catch (error) {
            this.handleRequestFailure(request, error as Error);
        } finally {
            this.activeConnections.delete(connectionId);
            this.processQueue();
        }
    }

    private handleRequestFailure(request: QueuedRequest, error: Error): void {
        this.circuitBreakerFailures++;
        this.circuitBreakerLastFailure = Date.now();

        if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
            this.isCircuitBreakerOpen = true;
            logger.warn('[ConnectionPool] Circuit breaker opened due to too many failures');
        }

        if (request.retryCount < this.config.retryAttempts) {
            const delay = this.config.retryDelay * Math.pow(2, request.retryCount);
            setTimeout(() => {
                request.retryCount++;
                this.requestQueue.unshift(request);
                this.processQueue();
            }, delay);
            logger.log(`[ConnectionPool] Retrying request ${request.id} (attempt ${request.retryCount + 1})`);
        } else {
            request.reject(new Error(`Request failed after ${this.config.retryAttempts} attempts: ${error.message}`));
        }
    }

    getStats(): PoolStats {
        const now = Date.now();
        const activeRequests = Array.from(this.activeConnections.values()).map(conn => ({
            id: conn.id, url: conn.url, duration: now - conn.startTime,
        }));

        return {
            activeConnections: this.activeConnections.size,
            maxConnections: this.config.maxConnections,
            queuedRequests: this.requestQueue.length,
            circuitBreakerOpen: this.isCircuitBreakerOpen,
            circuitBreakerFailures: this.circuitBreakerFailures,
            activeRequests,
            queueBreakdown: this.getQueueBreakdown(),
        };
    }

    private getQueueBreakdown() {
        const breakdown: { [priority: number]: number } = {};
        this.requestQueue.forEach(req => {
            breakdown[req.priority] = (breakdown[req.priority] || 0) + 1;
        });
        return breakdown;
    }

    abortAll(): void {
        for (const connection of this.activeConnections.values()) {
            connection.controller.abort();
        }
        this.activeConnections.clear();
        const queuedRequests = [...this.requestQueue];
        this.requestQueue = [];
        queuedRequests.forEach(request => {
            request.reject(new Error('Request aborted due to connection pool shutdown'));
        });
    }

    updateConfig(newConfig: Partial<ConnectionConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
        const stats = this.getStats();
        if (this.isCircuitBreakerOpen) return 'unhealthy';
        if (stats.queuedRequests > 10 || stats.circuitBreakerFailures > 0) return 'degraded';
        return 'healthy';
    }
}
