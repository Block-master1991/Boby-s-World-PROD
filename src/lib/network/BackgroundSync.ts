// Background sync for periodic data updates
import { logger } from "@/utils/logger";
import type { SyncStatus, SyncTask } from "./types";

export class BackgroundSync {
  private syncTasks: SyncTask[] = [];
  private runningTasks = new Set<string>();

  // Register a background sync task
  registerTask(id: string, task: () => Promise<void>, interval: number, enabled = true): void {
    // Remove existing task if it exists
    this.syncTasks = this.syncTasks.filter(t => t.id !== id);

    this.syncTasks.push({
      id,
      task,
      interval,
      lastRun: 0,
      enabled,
    });

    logger.log(`[BackgroundSync] Registered task: ${id} (interval: ${interval}ms)`);
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
          // eslint-disable-next-line no-await-in-loop
          await task.task();
          task.lastRun = now;
          logger.log(`[BackgroundSync] Task ${task.id} completed successfully`);
        } catch (error) {
          logger.error(`[BackgroundSync] Task ${task.id} failed:`, error);
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
      logger.log(`[BackgroundSync] Task ${id} ${enabled ? "enabled" : "disabled"}`);
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
      logger.log(`[BackgroundSync] Task ${id} force-run completed`);
    } finally {
      this.runningTasks.delete(id);
    }
  }

  // Get sync statistics
  getStats(): SyncStatus {
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
