/**
 * Security Scheduler
 * Manages automated periodic execution of security tests
 */

import { securityTestSuite, TestResult } from './securityTest';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { auditLogger } from './audit-logger';
import { initializeAdminApp } from './firebase-admin';
import { logger } from '@/utils/logger';

export interface ScheduledTestSummary {
    id: string;
    total: number;
    passed: number;
    failed: number;
    duration: number;
    timestamp: Date;
    results: TestResult[];
    status: 'success' | 'failure';
}

export class SecurityScheduler {
    private static readonly COLLECTION_NAME = 'security_test_runs';
    private static readonly MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    /**
     * Checks if enough time has passed since last run to avoid spamming
     */
    static async runScheduledTests(force: boolean = false): Promise<ScheduledTestSummary | { skipped: boolean; reason: string }> {
        logger.log('[SecurityScheduler] Starting scheduled security tests...');

        try {
            await initializeAdminApp();
            const db = getFirestore();

            // Check last run time if not forced
            if (!force) {
                const lastRunQuery = await db.collection(this.COLLECTION_NAME)
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                if (!lastRunQuery.empty) {
                    const lastRun = lastRunQuery.docs[0].data();
                    const lastRunTime = lastRun.timestamp.toDate().getTime();
                    const now = Date.now();

                    if (now - lastRunTime < this.MIN_INTERVAL_MS) {
                        logger.log('[SecurityScheduler] Skipping test run: Minimum interval not elapsed.');
                        return {
                            skipped: true,
                            reason: `Minimum interval of ${this.MIN_INTERVAL_MS / 1000}s not elapsed since last run.`
                        };
                    }
                }
            }

            // Run tests
            const results = await securityTestSuite.runAllTests();
            const summary = securityTestSuite.getReport().summary;

            const passed = Object.values(results).filter(r => r.success).length;
            const failed = Object.values(results).filter(r => !r.success).length;
            const status = failed === 0 ? 'success' : 'failure';

            const testRun: ScheduledTestSummary = {
                id: `run_${Date.now()}`,
                total: results.length,
                passed,
                failed,
                duration: summary.duration,
                timestamp: new Date(),
                results,
                status
            };

            // Store results in Firestore
            await db.collection(this.COLLECTION_NAME).add({
                ...testRun,
                timestamp: Timestamp.fromDate(testRun.timestamp)
            });

            // Log outcome
            if (status === 'failure') {
                await auditLogger.logEvent(
                    'admin_action' as any, // Temporary cast until type is updated globally or if mismatch
                    `Scheduled security tests FAILED. ${failed} tests failed.`,
                    {
                        failedCount: failed,
                        totalCount: results.length,
                        runId: testRun.id
                    },
                    'critical'
                );
            } else {
                await auditLogger.logEvent(
                    'admin_action' as any,
                    `Scheduled security tests completed successfully.`,
                    {
                        passedCount: passed,
                        totalCount: results.length,
                        runId: testRun.id
                    },
                    'info'
                );
            }

            return testRun;

        } catch (error) {
            logger.error('[SecurityScheduler] Error running scheduled tests:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await auditLogger.logEvent(
                'admin_action' as any,
                'Error executing scheduled security tests',
                { error: errorMessage },
                'error'
            );

            throw error;
        }
    }

    /**
     * Get history of security test runs
     */
    static async getTestHistory(limit: number = 10): Promise<ScheduledTestSummary[]> {
        await initializeAdminApp();
        const db = getFirestore();

        const snapshot = await db.collection(this.COLLECTION_NAME)
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp.toDate()
            } as ScheduledTestSummary;
        });
    }
}
