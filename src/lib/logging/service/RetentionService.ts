/**
 * Retention Service - Log Lifecycle Management
 * Handles cleanup of old logs and archiving policies
 */

import { professionalLogger } from "../index";

export interface RetentionPolicy {
  logType: "audit" | "application" | "performance";
  daysToKeep: number;
  archiveAfterDays?: number; // If set, move to archive instead of delete
}

export interface RetentionConfig {
  enabled: boolean;
  policies: RetentionPolicy[];
  checkInterval: number; // ms
}

const DEFAULT_CONFIG: RetentionConfig = {
  enabled: true,
  checkInterval: 24 * 60 * 60 * 1000, // Once a day
  policies: [
    { logType: "application", daysToKeep: 30 },
    { logType: "performance", daysToKeep: 7 },
    { logType: "audit", daysToKeep: 365, archiveAfterDays: 180 },
  ],
};

export class RetentionService {
  private static instance: RetentionService;
  private config: RetentionConfig;
  private interval: ReturnType<typeof setInterval> | null = null;

  // In a real app, these would interact with storage APIs
  private deleteHook: ((type: string, before: number) => Promise<number>) | null = null;
  private archiveHook: ((type: string, before: number) => Promise<number>) | null = null;

  private constructor(config: Partial<RetentionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.enabled) {
      this.startScheduler();
    }
  }

  public static getInstance(): RetentionService {
    if (!RetentionService.instance) {
      RetentionService.instance = new RetentionService();
    }
    return RetentionService.instance;
  }

  /**
   * Register hook to actually perform deletion on DB/Filesystem
   */
  registerDeleteHook(fn: (type: string, before: number) => Promise<number>) {
    this.deleteHook = fn;
  }

  /**
   * Register hook to actually perform archiving
   */
  registerArchiveHook(fn: (type: string, before: number) => Promise<number>) {
    this.archiveHook = fn;
  }

  startScheduler() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.runRetentionChecks().catch(err => {
        professionalLogger.error("[RetentionService] Scheduler check failed", err);
      });
    }, this.config.checkInterval);

    // Don't keep process alive (Node.js)
    const timer = this.interval as unknown as { unref?: () => void };
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
  }

  async runRetentionChecks() {
    if (!this.deleteHook) {
      professionalLogger.warn("[RetentionService] No delete hook registered, skipping cleanup");
      return;
    }

    const activeDeleteHook = this.deleteHook;
    const activeArchiveHook = this.archiveHook;

    professionalLogger.info("[RetentionService] Starting retention checks...");

    // Process all policies in parallel for better performance
    await Promise.all(
      this.config.policies.map(async policy => {
        try {
          const now = Date.now();
          const deleteCutoff = now - policy.daysToKeep * 24 * 60 * 60 * 1000;

          // 1. Archiving
          if (policy.archiveAfterDays && activeArchiveHook) {
            const archiveCutoff = now - policy.archiveAfterDays * 24 * 60 * 60 * 1000;
            const archivedCount = await activeArchiveHook(policy.logType, archiveCutoff);
            if (archivedCount > 0) {
              professionalLogger.info(
                `[Retention] Archived ${archivedCount} ${policy.logType} logs older than ${policy.archiveAfterDays} days`
              );
            }
          }

          // 2. Deletion
          const deletedCount = await activeDeleteHook(policy.logType, deleteCutoff);
          if (deletedCount > 0) {
            professionalLogger.info(
              `[Retention] Deleted ${deletedCount} ${policy.logType} logs older than ${policy.daysToKeep} days`
            );
          }
        } catch (err) {
          professionalLogger.error(
            `[Retention] Failed processing policy for ${policy.logType}`,
            err
          );
        }
      })
    );

    professionalLogger.info("[RetentionService] Retention checks completed");
  }
}

export const retentionService = RetentionService.getInstance();
