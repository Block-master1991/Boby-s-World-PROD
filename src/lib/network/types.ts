// Network utility types

export interface ConnectionConfig {
    maxConnections: number;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
}

export interface QueuedRequest {
    id: string;
    url: string;
    options: RequestInit;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
    priority: number;
    timestamp: number;
    retryCount: number;
}

export interface ActiveConnection {
    id: string;
    url: string;
    controller: AbortController;
    startTime: number;
}

export interface SyncTask {
    id: string;
    task: () => Promise<void>;
    interval: number;
    lastRun: number;
    enabled: boolean;
}

export interface SyncStatus {
    totalTasks: number;
    enabledTasks: number;
    runningTasks: number;
    taskDetails: Array<{
        id: string;
        enabled: boolean;
        running: boolean;
        timeSinceLastRun: number;
        interval: number;
    }>;
}

export interface PoolStats {
    activeConnections: number;
    maxConnections: number;
    queuedRequests: number;
    circuitBreakerOpen: boolean;
    circuitBreakerFailures: number;
    activeRequests: Array<{ id: string; url: string; duration: number }>;
    queueBreakdown: { [priority: number]: number };
}
