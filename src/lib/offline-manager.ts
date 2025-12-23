// Offline Capabilities Manager
// Handles offline functionality and data synchronization

interface OfflineQueueItem {
    id: string;
    type: 'api_call' | 'game_action' | 'user_data';
    data: any;
    timestamp: number;
    priority: number;
    retryCount: number;
    maxRetries: number;
}

interface SyncStatus {
    isOnline: boolean;
    lastSyncTime: number;
    pendingItems: number;
    failedItems: number;
    syncInProgress: boolean;
}

class OfflineManager {
    private isOnline = navigator.onLine;
    private syncStatus: SyncStatus = {
        isOnline: navigator.onLine,
        lastSyncTime: 0,
        pendingItems: 0,
        failedItems: 0,
        syncInProgress: false,
    };

    private offlineQueue: OfflineQueueItem[] = [];
    private syncCallbacks: Array<(status: SyncStatus) => void> = [];
    private maxQueueSize = 1000;
    private syncInterval = 30000; // 30 seconds
    private syncTimer: NodeJS.Timeout | null = null;

    constructor() {
        this.initializeOfflineDetection();
        this.loadPersistedQueue();
        this.startPeriodicSync();
    }

    private initializeOfflineDetection(): void {
        window.addEventListener('online', () => {
            console.log('[OfflineManager] Connection restored');
            this.isOnline = true;
            this.updateSyncStatus({ isOnline: true });
            this.processOfflineQueue();
        });

        window.addEventListener('offline', () => {
            console.log('[OfflineManager] Connection lost');
            this.isOnline = false;
            this.updateSyncStatus({ isOnline: false });
        });
    }

    // Queue operation for offline execution
    queueOperation(
        type: OfflineQueueItem['type'],
        data: any,
        priority: number = 1,
        maxRetries: number = 3
    ): string {
        const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const item: OfflineQueueItem = {
            id,
            type,
            data,
            timestamp: Date.now(),
            priority,
            retryCount: 0,
            maxRetries,
        };

        // Add to queue with priority sorting
        this.offlineQueue.push(item);
        this.offlineQueue.sort((a, b) => b.priority - a.priority);

        // Enforce queue size limit
        if (this.offlineQueue.length > this.maxQueueSize) {
            const removed = this.offlineQueue.splice(this.maxQueueSize);
            console.warn(`[OfflineManager] Queue full, removed ${removed.length} old items`);
        }

        this.updateSyncStatus({ pendingItems: this.offlineQueue.length });
        this.persistQueue();

        // Try to process immediately if online
        if (this.isOnline) {
            this.processOfflineQueue();
        }

        return id;
    }

    // Process queued operations when back online
    private async processOfflineQueue(): Promise<void> {
        if (!this.isOnline || this.syncStatus.syncInProgress || this.offlineQueue.length === 0) {
            return;
        }

        this.updateSyncStatus({ syncInProgress: true });

        const itemsToProcess = [...this.offlineQueue];
        let processedCount = 0;
        let failedCount = 0;

        for (const item of itemsToProcess) {
            try {
                await this.executeQueuedOperation(item);
                this.offlineQueue = this.offlineQueue.filter(i => i.id !== item.id);
                processedCount++;
            } catch (error) {
                console.error(`[OfflineManager] Failed to process queued item ${item.id}:`, error);
                item.retryCount++;

                if (item.retryCount >= item.maxRetries) {
                    this.offlineQueue = this.offlineQueue.filter(i => i.id !== item.id);
                    failedCount++;
                }
            }
        }

        this.updateSyncStatus({
            syncInProgress: false,
            lastSyncTime: Date.now(),
            pendingItems: this.offlineQueue.length,
            failedItems: failedCount,
        });

        this.persistQueue();

        console.log(`[OfflineManager] Processed ${processedCount} items, ${failedCount} failed, ${this.offlineQueue.length} remaining`);
    }

    private async executeQueuedOperation(item: OfflineQueueItem): Promise<void> {
        switch (item.type) {
            case 'api_call':
                await this.executeApiCall(item.data);
                break;
            case 'game_action':
                await this.executeGameAction(item.data);
                break;
            case 'user_data':
                await this.syncUserData(item.data);
                break;
            default:
                throw new Error(`Unknown operation type: ${item.type}`);
        }
    }

    private async executeApiCall(data: any): Promise<void> {
        const response = await fetch(data.url, data.options || {});
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }
    }

    private async executeGameAction(data: any): Promise<void> {
        // Implement game action replay logic
        // This would depend on your specific game mechanics
        console.log('[OfflineManager] Executing game action:', data);
    }

    private async syncUserData(data: any): Promise<void> {
        // Implement user data synchronization
        console.log('[OfflineManager] Syncing user data:', data);
    }

    // Persist queue to IndexedDB for persistence across sessions
    private async persistQueue(): Promise<void> {
        try {
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['offlineQueue'], 'readwrite');
            const store = transaction.objectStore('offlineQueue');

            // Clear existing data
            await this.clearObjectStore(store);

            // Store current queue
            for (const item of this.offlineQueue) {
                store.put(item);
            }

            console.log(`[OfflineManager] Persisted ${this.offlineQueue.length} queue items`);
        } catch (error) {
            console.error('[OfflineManager] Failed to persist queue:', error);
        }
    }

    // Load persisted queue on initialization
    private async loadPersistedQueue(): Promise<void> {
        try {
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['offlineQueue'], 'readonly');
            const store = transaction.objectStore('offlineQueue');

            const items = await this.getAllFromStore(store);
            this.offlineQueue = items;
            this.updateSyncStatus({ pendingItems: this.offlineQueue.length });

            console.log(`[OfflineManager] Loaded ${this.offlineQueue.length} persisted queue items`);
        } catch (error) {
            console.error('[OfflineManager] Failed to load persisted queue:', error);
        }
    }

    private async openIndexedDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('BobyWorldOffline', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('offlineQueue')) {
                    db.createObjectStore('offlineQueue', { keyPath: 'id' });
                }
            };
        });
    }

    private async clearObjectStore(store: IDBObjectStore): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    private async getAllFromStore(store: IDBObjectStore): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private startPeriodicSync(): void {
        this.syncTimer = setInterval(() => {
            if (this.isOnline && !this.syncStatus.syncInProgress) {
                this.processOfflineQueue();
            }
        }, this.syncInterval);
    }

    private updateSyncStatus(updates: Partial<SyncStatus>): void {
        this.syncStatus = { ...this.syncStatus, ...updates };

        // Notify subscribers
        this.syncCallbacks.forEach(callback => {
            try {
                callback(this.syncStatus);
            } catch (error) {
                console.error('[OfflineManager] Error in sync callback:', error);
            }
        });
    }

    // Public API
    onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
        this.syncCallbacks.push(callback);

        // Return unsubscribe function
        return () => {
            const index = this.syncCallbacks.indexOf(callback);
            if (index > -1) {
                this.syncCallbacks.splice(index, 1);
            }
        };
    }

    getSyncStatus(): SyncStatus {
        return { ...this.syncStatus };
    }

    forceSync(): Promise<void> {
        return this.processOfflineQueue();
    }

    clearQueue(): void {
        this.offlineQueue = [];
        this.updateSyncStatus({ pendingItems: 0 });
        this.persistQueue();
    }

    dispose(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.syncCallbacks = [];
    }
}

// Background Processing Manager
class BackgroundProcessor {
    private tasks: Array<{
        id: string;
        task: () => Promise<void>;
        priority: number;
        timeout: number;
    }> = [];

    private isProcessing = false;
    private processingTimer: NodeJS.Timeout | null = null;

    // Add background task
    addTask(task: () => Promise<void>, priority: number = 1, timeout: number = 30000): string {
        const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.tasks.push({
            id,
            task,
            priority,
            timeout,
        });

        // Sort by priority (higher first)
        this.tasks.sort((a, b) => b.priority - a.priority);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.startProcessing();
        }

        return id;
    }

    private async startProcessing(): Promise<void> {
        if (this.isProcessing || this.tasks.length === 0) return;

        this.isProcessing = true;

        while (this.tasks.length > 0) {
            const task = this.tasks.shift()!;
            const startTime = Date.now();

            try {
                // Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Task timeout')), task.timeout);
                });

                // Race between task and timeout
                await Promise.race([task.task(), timeoutPromise]);

                const duration = Date.now() - startTime;
                console.log(`[BackgroundProcessor] Task ${task.id} completed in ${duration}ms`);

            } catch (error) {
                console.error(`[BackgroundProcessor] Task ${task.id} failed:`, error);
            }

            // Small delay between tasks to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.isProcessing = false;
    }

    // Get processing stats
    getStats() {
        return {
            queuedTasks: this.tasks.length,
            isProcessing: this.isProcessing,
        };
    }

    // Clear all pending tasks
    clearTasks(): void {
        this.tasks = [];
    }

    dispose(): void {
        this.clearTasks();
        if (this.processingTimer) {
            clearTimeout(this.processingTimer);
            this.processingTimer = null;
        }
    }
}

// Singleton instances
let offlineManager: OfflineManager | null = null;
let backgroundProcessor: BackgroundProcessor | null = null;

// Factory functions
export const initializeOfflineCapabilities = (): OfflineManager => {
    if (!offlineManager) {
        offlineManager = new OfflineManager();
    }
    return offlineManager;
};

export const initializeBackgroundProcessing = (): BackgroundProcessor => {
    if (!backgroundProcessor) {
        backgroundProcessor = new BackgroundProcessor();
    }
    return backgroundProcessor;
};

export const getOfflineManager = (): OfflineManager | null => {
    return offlineManager;
};

export const getBackgroundProcessor = (): BackgroundProcessor | null => {
    return backgroundProcessor;
};

// Utility functions
export const isOnline = (): boolean => {
    return navigator.onLine;
};

export const queueOfflineOperation = (
    type: OfflineQueueItem['type'],
    data: any,
    priority: number = 1
): string | null => {
    if (offlineManager) {
        return offlineManager.queueOperation(type, data, priority);
    }
    return null;
};

export const addBackgroundTask = (
    task: () => Promise<void>,
    priority: number = 1,
    timeout: number = 30000
): string | null => {
    if (backgroundProcessor) {
        return backgroundProcessor.addTask(task, priority, timeout);
    }
    return null;
};
