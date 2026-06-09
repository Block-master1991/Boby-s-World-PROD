/**
 * Security Scheduler
 * Manages automated periodic execution of security tests
 */

import { logger } from "@/utils/logger";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { TestResult } from "../../tests/utils/securityTest";
import { securityTestSuite } from "../../tests/utils/securityTest";
import { auditLogger, type AuditEventType } from "../audit-logger";
import { initializeAdminApp } from "../firebase-admin";

export interface ScheduledTestSummary {
  id: string;
  total: number;
  passed: number;
  failed: number;
  duration: number;
  timestamp: Date;
  results: TestResult[];
  status: "success" | "failure";
}

export class SecurityScheduler {
  private static readonly COLLECTION_NAME = "security_test_runs";
  private static readonly MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Checks if enough time has passed since last run to avoid spamming
   */
  static async runScheduledTests(
    force: boolean = false
  ): Promise<ScheduledTestSummary | { skipped: boolean; reason: string }> {
    logger.log("[SecurityScheduler] Starting scheduled security tests...");

    try {
      await initializeAdminApp();
      const db = getFirestore();

      if (!(await this.shouldRunTests(db, force))) {
        logger.log("[SecurityScheduler] Skipping test run: Minimum interval not elapsed.");
        return {
          skipped: true,
          reason: `Minimum interval of ${this.MIN_INTERVAL_MS / 1000}s not elapsed since last run.`,
        };
      }

      // Run tests
      const results = await securityTestSuite.runAllTests();
      const { summary } = securityTestSuite.getReport();

      const passed = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const status = failed === 0 ? "success" : "failure";

      const testRun: ScheduledTestSummary = {
        id: `run_${Date.now()}`,
        total: results.length,
        passed,
        failed,
        duration: summary.duration,
        timestamp: new Date(),
        results,
        status,
      };

      await this.saveTestRun(db, testRun);
      await this.logAuditOutcome(status, { passed, failed, total: results.length }, testRun.id);

      return testRun;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  private static async shouldRunTests(db: Firestore, force: boolean): Promise<boolean> {
    if (force) return true;

    const lastRunQuery = await db
      .collection(this.COLLECTION_NAME)
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();

    if (lastRunQuery.empty) return true;

    const [lastDoc] = lastRunQuery.docs;
    if (!lastDoc) return true; // Safety check for TS

    const lastRun = lastDoc.data();
    const lastTimestamp = lastRun["timestamp"] as Timestamp | undefined;

    if (!lastTimestamp) return true;

    const lastRunTime = lastTimestamp.toDate().getTime();
    return Date.now() - lastRunTime >= this.MIN_INTERVAL_MS;
  }

  private static async saveTestRun(db: Firestore, run: ScheduledTestSummary): Promise<void> {
    await db.collection(this.COLLECTION_NAME).add({
      ...run,
      timestamp: Timestamp.fromDate(run.timestamp),
    });
  }

  private static async logAuditOutcome(
    status: "success" | "failure",
    stats: { passed: number; failed: number; total: number },
    runId: string
  ): Promise<void> {
    if (status === "failure") {
      await auditLogger.logEvent(
        "ADMIN_ACTION" as AuditEventType,
        `Scheduled security tests FAILED. ${stats.failed} tests failed.`,
        { failedCount: stats.failed, totalCount: stats.total, runId },
        "critical"
      );
    } else {
      await auditLogger.logEvent(
        "ADMIN_ACTION" as AuditEventType,
        `Scheduled security tests completed successfully.`,
        { passedCount: stats.passed, totalCount: stats.total, runId },
        "info"
      );
    }
  }

  private static async handleError(error: unknown): Promise<void> {
    logger.error("[SecurityScheduler] Error running scheduled tests:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await auditLogger.logEvent(
      "ADMIN_ACTION" as AuditEventType,
      "Error executing scheduled security tests",
      { error: errorMessage },
      "error"
    );
  }

  /**
   * Get history of security test runs
   */
  static async getTestHistory(limit: number = 10): Promise<ScheduledTestSummary[]> {
    await initializeAdminApp();
    const db = getFirestore();

    const snapshot = await db
      .collection(this.COLLECTION_NAME)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      const timestamp = data["timestamp"] as Timestamp;
      return {
        ...data,
        timestamp: timestamp ? timestamp.toDate() : new Date(),
      } as ScheduledTestSummary;
    });
  }
}
