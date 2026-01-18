// Offline Capabilities Manager
import { logger } from 'utils/logger';
import {
    addBackgroundTask,
    getBackgroundProcessor,
    initializeBackgroundProcessing
} from './BackgroundProcessor';
import { clearObjectStore, getAllFromStore, openIndexedDB } from './offline/db';
import type { OfflineQueueItem, SyncStatus } from './offline/types';
// --- Re-exports for backward compatibility ---
export { addBackgroundTask, getBackgroundProcessor, initializeBackgroundProcessing };
export type { OfflineQueueItem, SyncStatus };
// Handles offline functionality and data synchronization
class OfflineManager {
    private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    private syncStatus: SyncStatus = {
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
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
        // Skip on SSR
        if (typeof window === 'undefined') return;

        window.addEventListener('online', () => {
            logger.log('[OfflineManager] Connection restored');
            this.isOnline = true;
            this.updateSyncStatus({ isOnline: true });
            this.processOfflineQueue();
        });

        window.addEventListener('offline', () => {
            logger.log('[OfflineManager] Connection lost');
            this.isOnline = false;
            this.updateSyncStatus({ isOnline: false });
        });
    }

    // Queue operation for offline execution
    queueOperation(
        type: OfflineQueueItem['type'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any,
        priority = 1,
        maxRetries = 3
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
            logger.warn(`[OfflineManager] Queue full, removed ${removed.length} old items`);
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
                // eslint-disable-next-line no-await-in-loop
                await this.executeQueuedOperation(item);
                this.offlineQueue = this.offlineQueue.filter(i => i.id !== item.id);
                processedCount++;
            } catch (error) {
                logger.error(`[OfflineManager] Failed to process queued item ${item.id}:`, error);
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

        logger.log(`[OfflineManager] Processed ${processedCount} items, ${failedCount} failed, ${this.offlineQueue.length} remaining`);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async executeApiCall(data: any): Promise<void> {
        const response = await fetch(data.url, data.options || {});
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, require-await
    private async executeGameAction(data: any): Promise<void> {
        // Implement game action replay logic
        // This would depend on your specific game mechanics
        logger.log('[OfflineManager] Executing game action:', data);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, require-await
    private async syncUserData(data: any): Promise<void> {
        // Implement user data synchronization
        logger.log('[OfflineManager] Syncing user data:', data);
    }

    // Persist queue to IndexedDB for persistence across sessions
    private async persistQueue(): Promise<void> {
        try {
            const db = await openIndexedDB();
            const transaction = db.transaction(['offlineQueue'], 'readwrite');
            const store = transaction.objectStore('offlineQueue');

            // Clear existing data
            await clearObjectStore(store);

            // Store current queue
            for (const item of this.offlineQueue) {
                store.put(item);
            }

            logger.log(`[OfflineManager] Persisted ${this.offlineQueue.length} queue items`);
        } catch (error) {
            logger.error('[OfflineManager] Failed to persist queue:', error);
        }
    }

    // Load persisted queue on initialization
    private async loadPersistedQueue(): Promise<void> {
        try {
            const db = await openIndexedDB();
            const transaction = db.transaction(['offlineQueue'], 'readonly');
            const store = transaction.objectStore('offlineQueue');

            const items = await getAllFromStore(store);
            this.offlineQueue = items;
            this.updateSyncStatus({ pendingItems: this.offlineQueue.length });

            logger.log(`[OfflineManager] Loaded ${this.offlineQueue.length} persisted queue items`);
        } catch (error) {
            logger.error('[OfflineManager] Failed to load persisted queue:', error);
        }
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
                logger.error('[OfflineManager] Error in sync callback:', error);
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

// Singleton instances
let offlineManager: OfflineManager | null = null;

// Factory functions
export const initializeOfflineCapabilities = (): OfflineManager => {
    if (!offlineManager) {
        offlineManager = new OfflineManager();
    }
    return offlineManager;
};

export const getOfflineManager = (): OfflineManager | null => {
    return offlineManager;
};

export { OfflineManager };

// Utility functions
export const isOnline = (): boolean => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
};

export const queueOfflineOperation = (
    type: OfflineQueueItem['type'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    priority = 1
): string | null => {
    if (offlineManager) {
        return offlineManager.queueOperation(type, data, priority);
    }
    return null;
};
