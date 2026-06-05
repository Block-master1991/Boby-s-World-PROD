/**
 * Service Worker Background Sync Manager
 */

import { logger } from "utils/logger";
import type { SyncOperation } from "./types";

// Define types for missing ServiceWorker global properties
interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ExtendedServiceWorkerRegistration extends ServiceWorkerRegistration {
  sync?: SyncManager;
}

export class BackgroundSyncManager {
  private pendingOperations: SyncOperation[] = [];

  constructor() {
    this.initializeBackgroundSync();
  }

  private initializeBackgroundSync(): void {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration: ServiceWorkerRegistration) => {
        const reg = registration as ExtendedServiceWorkerRegistration;
        if (reg.sync) {
          reg.sync.register("game-data-sync").catch((err: unknown) => {
            logger.log("[BackgroundSync] Sync registration failed:", err);
          });
        }
      });
    }

    setInterval(() => {
      this.cleanupOldOperations();
    }, 30000);
  }

  public addOperation(operation: () => Promise<void>, priority: number = 1): string {
    const id = `op_${Date.now()}_${Math.random()}`;
    this.pendingOperations.push({ id, operation, priority, timestamp: Date.now() });
    this.pendingOperations.sort((a, b) => b.priority - a.priority);
    return id;
  }

  public async processOperations(): Promise<void> {
    if (this.pendingOperations.length === 0) return;

    const ops = [...this.pendingOperations];
    this.pendingOperations = [];

    const results = await Promise.allSettled(ops.map(op => op.operation()));

    results.forEach((result, index) => {
      const op = ops[index];
      if (result.status === "rejected" && op) {
        logger.error(`[BackgroundSync] Operation ${op.id} failed:`, result.reason);
        this.pendingOperations.push({
          id: op.id,
          operation: op.operation,
          priority: Math.max(0, op.priority - 1),
          timestamp: Date.now(),
        });
      }
    });
  }

  private cleanupOldOperations(): void {
    const maxAge = 5 * 60 * 1000;
    const now = Date.now();
    this.pendingOperations = this.pendingOperations.filter(op => now - op.timestamp <= maxAge);
  }

  public getStats() {
    return {
      pendingOperations: this.pendingOperations.length,
      operationsByPriority: this.pendingOperations.reduce(
        (acc, op) => {
          acc[op.priority] = (acc[op.priority] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>
      ),
    };
  }
}
