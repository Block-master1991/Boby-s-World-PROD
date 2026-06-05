// Network Utility Entry Point
import { logger } from "@/utils/logger";
import { BackgroundSync } from "./BackgroundSync";
import { ConnectionPool } from "./ConnectionPool";
import type { ConnectionConfig } from "./types";

// Singleton instances
let connectionPool: ConnectionPool | null = null;
let backgroundSync: BackgroundSync | null = null;

export const initializeConnectionPooling = (config?: Partial<ConnectionConfig>): ConnectionPool => {
  if (!connectionPool) {
    connectionPool = new ConnectionPool(config);
    logger.log("[ConnectionPooling] Initialized with config:", config);
  }
  return connectionPool;
};

export const initializeBackgroundSync = (): BackgroundSync => {
  if (!backgroundSync) {
    backgroundSync = new BackgroundSync();
    backgroundSync.start();
    logger.log("[BackgroundSync] Initialized and started");
  }
  return backgroundSync;
};

export const getConnectionPool = (): ConnectionPool | null => connectionPool;
export const getBackgroundSync = (): BackgroundSync | null => backgroundSync;

// Enhanced fetch wrapper that uses the connection pool
export const pooledFetch = (
  url: string,
  options: RequestInit = {},
  priority = 1
): Promise<Response> => {
  if (!connectionPool) {
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
      status: connectionPool?.getHealthStatus() || "not_initialized",
      ...poolStats,
    },
    backgroundSync: syncStats,
    overall: {
      healthy:
        connectionPool?.getHealthStatus() === "healthy" &&
        (!syncStats || syncStats.runningTasks === 0),
    },
  };
};

export * from "./BackgroundSync";
export * from "./ConnectionPool";
export * from "./types";
