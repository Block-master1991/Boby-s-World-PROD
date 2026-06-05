// Offline Manager Types
export interface OfflineQueueItem {
  id: string;
  type: "api_call" | "game_action" | "user_data";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  timestamp: number;
  priority: number;
  retryCount: number;
  maxRetries: number;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: number;
  pendingItems: number;
  failedItems: number;
  syncInProgress: boolean;
}
