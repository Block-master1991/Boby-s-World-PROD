// Connection Pooling Manager for Optimized Network Requests
// Reuses connections and manages request queuing for better performance

interface ConnectionConfig {
    maxConnections: number;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
}

interface QueuedRequest {
    id: string;
    url: string;
    options: RequestInit;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
    priority: number;
    timestamp: number;
    retryCount: number;
}

interface ActiveConnection {
    id: string;
    url: string;
    controller: AbortController;
    startTime: number;
}

class ConnectionPool {
    private config: ConnectionConfig;
    private activeConnections = new Map<string, ActiveConnection>();
    private requestQueue: QueuedRequest[] = [];
    private circuitBreakerFailures = 0;
    private circuitBreakerLastFailure = 0;
    private isCircuitBreakerOpen = false;

    constructor(config: Partial<ConnectionConfig> = {}) {
        this.config = {
            maxConnections: 6, // Chrome's limit is 6 concurrent connections per domain
            timeout: 30000,
            retryAttempts: 3,
            retryDelay: 1000,
            circuitBreakerThreshold: 5,
            circuitBreakerTimeout: 60000,
            ...config,
        };
    }

    // Enhanced fetch with connection pooling
    async fetch(url: string, options: RequestInit = {}, priority: number = 1): Promise<Response> {
        // Check circuit breaker
        if (this.isCircuitBreakerOpen) {
            if (Date.now() - this.circuitBreakerLastFailure < this.config.circuitBreakerTimeout) {
                throw new Error('Circuit breaker is open - too many failures');
            } else {
                this.isCircuitBreakerOpen = false;
                this.circuitBreakerFailures = 0;
            }
        }

        return new Promise((resolve, reject) => {
            const request: QueuedRequest = {
                id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                url,
                options,
                resolve,
                reject,
                priority,
                timestamp: Date.now(),
                retryCount: 0,
            };

            this.requestQueue.push(request);
            this.requestQueue.sort((a, b) => a.priority - b.priority); // Lower priority number = higher priority

            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        // Don't process if we're at max connections or circuit breaker is open
        if (this.activeConnections.size >= this.config.maxConnections || this.isCircuitBreakerOpen) {
            return;
        }

        // Find next request to process
        const nextRequest = this.requestQueue.shift();
        if (!nextRequest) return;

        // Check if we can make this request
        if (this.activeConnections.size >= this.config.maxConnections) {
            // Put it back in queue
            this.requestQueue.unshift(nextRequest);
            return;
        }

        await this.executeRequest(nextRequest);
    }

    private async executeRequest(request: QueuedRequest): Promise<void> {
        const controller = new AbortController();
        const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Track active connection
        this.activeConnections.set(connectionId, {
            id: connectionId,
            url: request.url,
            controller,
            startTime: Date.now(),
        });

        try {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, this.config.timeout);

            // Execute the request
            const response = await fetch(request.url, {
                ...request.options,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Success - resolve the promise
            request.resolve(response);

            // Reset circuit breaker on success
            this.circuitBreakerFailures = 0;

        } catch (error) {
            // Handle failure
            await this.handleRequestFailure(request, error as Error);
        } finally {
            // Clean up connection
            this.activeConnections.delete(connectionId);

            // Process next request in queue
            this.processQueue();
        }
    }

    private async handleRequestFailure(request: QueuedRequest, error: Error): Promise<void> {
        // Update circuit breaker
        this.circuitBreakerFailures++;
        this.circuitBreakerLastFailure = Date.now();

        if (this.circuitBreakerFailures >= this.config.circuitBreakerThreshold) {
            this.isCircuitBreakerOpen = true;
            console.warn('[ConnectionPool] Circuit breaker opened due to too many failures');
        }

        // Check if we should retry
        if (request.retryCount < this.config.retryAttempts) {
            // Exponential backoff
            const delay = this.config.retryDelay * Math.pow(2, request.retryCount);

            setTimeout(() => {
                request.retryCount++;
                this.requestQueue.unshift(request); // Retry with higher priority
                this.processQueue();
            }, delay);

            console.log(`[ConnectionPool] Retrying request ${request.id} (attempt ${request.retryCount + 1})`);
        } else {
            // Max retries reached, reject the promise
            request.reject(new Error(`Request failed after ${this.config.retryAttempts} attempts: ${error.message}`));
        }
    }

    // Get pool statistics
    getStats() {
        const now = Date.now();
        const activeRequests = Array.from(this.activeConnections.values()).map(conn => ({
            id: conn.id,
            url: conn.url,
            duration: now - conn.startTime,
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

    // Abort all active connections
    abortAll(): void {
        for (const connection of this.activeConnections.values()) {
            connection.controller.abort();
        }
        this.activeConnections.clear();

        // Reject all queued requests
        const queuedRequests = [...this.requestQueue];
        this.requestQueue = [];

        queuedRequests.forEach(request => {
            request.reject(new Error('Request aborted due to connection pool shutdown'));
        });
    }

    // Update configuration
    updateConfig(newConfig: Partial<ConnectionConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    // Health check
    getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
        const stats = this.getStats();

        if (this.isCircuitBreakerOpen) return 'unhealthy';
        if (stats.queuedRequests > 10 || stats.circuitBreakerFailures > 0) return 'degraded';

        return 'healthy';
    }
}

// Background sync for periodic data updates
class BackgroundSync {
    private syncTasks: Array<{
        id: string;
        task: () => Promise<void>;
        interval: number;
        lastRun: number;
        enabled: boolean;
    }> = [];

    private runningTasks = new Set<string>();

    // Register a background sync task
    registerTask(
        id: string,
        task: () => Promise<void>,
        interval: number,
        enabled: boolean = true
    ): void {
        // Remove existing task if it exists
        this.syncTasks = this.syncTasks.filter(t => t.id !== id);

        this.syncTasks.push({
            id,
            task,
            interval,
            lastRun: 0,
            enabled,
        });

        console.log(`[BackgroundSync] Registered task: ${id} (interval: ${interval}ms)`);
    }

    // Start background sync processing
    start(): void {
        setInterval(() => {
            this.processTasks();
        }, 5000); // Check every 5 seconds
    }

    private async processTasks(): Promise<void> {
        const now = Date.now();

        for (const task of this.syncTasks) {
            if (!task.enabled || this.runningTasks.has(task.id)) continue;

            if (now - task.lastRun >= task.interval) {
                this.runningTasks.add(task.id);

                try {
                    await task.task();
                    task.lastRun = now;
                    console.log(`[BackgroundSync] Task ${task.id} completed successfully`);
                } catch (error) {
                    console.error(`[BackgroundSync] Task ${task.id} failed:`, error);
                    // Don't update lastRun on failure to retry sooner
                } finally {
                    this.runningTasks.delete(task.id);
                }
            }
        }
    }

    // Enable/disable tasks
    setTaskEnabled(id: string, enabled: boolean): void {
        const task = this.syncTasks.find(t => t.id === id);
        if (task) {
            task.enabled = enabled;
            console.log(`[BackgroundSync] Task ${id} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    // Force run a specific task
    async forceRunTask(id: string): Promise<void> {
        const task = this.syncTasks.find(t => t.id === id);
        if (!task) throw new Error(`Task ${id} not found`);

        if (this.runningTasks.has(id)) {
            throw new Error(`Task ${id} is already running`);
        }

        this.runningTasks.add(id);

        try {
            await task.task();
            task.lastRun = Date.now();
            console.log(`[BackgroundSync] Task ${id} force-run completed`);
        } finally {
            this.runningTasks.delete(id);
        }
    }

    // Get sync statistics
    getStats() {
        const now = Date.now();
        return {
            totalTasks: this.syncTasks.length,
            enabledTasks: this.syncTasks.filter(t => t.enabled).length,
            runningTasks: this.runningTasks.size,
            taskDetails: this.syncTasks.map(task => ({
                id: task.id,
                enabled: task.enabled,
                running: this.runningTasks.has(task.id),
                timeSinceLastRun: now - task.lastRun,
                interval: task.interval,
            })),
        };
    }
}

// Singleton instances
let connectionPool: ConnectionPool | null = null;
let backgroundSync: BackgroundSync | null = null;

// Factory functions
export const initializeConnectionPooling = (config?: Partial<ConnectionConfig>): ConnectionPool => {
    if (!connectionPool) {
        connectionPool = new ConnectionPool(config);
        console.log('[ConnectionPooling] Initialized with config:', config);
    }
    return connectionPool;
};

export const initializeBackgroundSync = (): BackgroundSync => {
    if (!backgroundSync) {
        backgroundSync = new BackgroundSync();
        backgroundSync.start();
        console.log('[BackgroundSync] Initialized and started');
    }
    return backgroundSync;
};

export const getConnectionPool = (): ConnectionPool | null => {
    return connectionPool;
};

export const getBackgroundSync = (): BackgroundSync | null => {
    return backgroundSync;
};

// Enhanced fetch wrapper that uses the connection pool
export const pooledFetch = async (
    url: string,
    options: RequestInit = {},
    priority: number = 1
): Promise<Response> => {
    if (!connectionPool) {
        // Fallback to regular fetch if pool is not initialized
        return fetch(url, options);
    }

    return connectionPool.fetch(url, options, priority);
};

// Utility functions for background sync tasks
export const createPeriodicSyncTask = (
    id: string,
    syncFunction: () => Promise<void>,
    interval: number
): void => {
    if (backgroundSync) {
        backgroundSync.registerTask(id, syncFunction, interval);
    }
};

// Get overall network health
export const getNetworkHealth = () => {
    const poolStats = connectionPool?.getStats();
    const syncStats = backgroundSync?.getStats();

    return {
        connectionPool: {
            status: connectionPool?.getHealthStatus() || 'not_initialized',
            ...poolStats,
        },
        backgroundSync: syncStats,
        overall: {
            healthy: (connectionPool?.getHealthStatus() === 'healthy') &&
                (!syncStats || syncStats.runningTasks === 0),
        },
    };
};
