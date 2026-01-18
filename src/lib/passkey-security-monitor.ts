/**
 * Enhanced Passkey Security Monitor
 * Provides real-time monitoring and alerting for passkey-related security events
 */

import { auditLogger } from './audit-logger';
import { sendSlackAlert } from './slack-alert';

export interface PasskeySecurityMetrics {
    totalPasskeys: number;
    activePasskeys: number;
    failedLoginAttempts: number;
    recoveryAttempts: number;
    suspiciousActivities: number;
}

export interface PasskeyDeviceInfo {
    browser?: string;
    os?: string;
    device?: string;
    userAgent?: string;
    [key: string]: unknown;
}

export class PasskeySecurityMonitor {
    private static instance: PasskeySecurityMonitor;
    private metrics: PasskeySecurityMetrics = {
        totalPasskeys: 0,
        activePasskeys: 0,
        failedLoginAttempts: 0,
        recoveryAttempts: 0,
        suspiciousActivities: 0,
    };

    private alertThresholds = {
        failedLoginsPerHour: 10,
        recoveryAttemptsPerHour: 5,
        suspiciousActivitiesPerHour: 3,
    };

    private constructor() {
        this.initializeMonitoring();
    }

    public static getInstance(): PasskeySecurityMonitor {
        if (!PasskeySecurityMonitor.instance) {
            PasskeySecurityMonitor.instance = new PasskeySecurityMonitor();
        }
        return PasskeySecurityMonitor.instance;
    }

    private initializeMonitoring(): void {
        // Reset hourly metrics
        setInterval(() => {
            this.resetHourlyMetrics();
        }, 60 * 60 * 1000); // Every hour
    }

    private resetHourlyMetrics(): void {
        this.metrics.failedLoginAttempts = 0;
        this.metrics.recoveryAttempts = 0;
        this.metrics.suspiciousActivities = 0;
    }

    /**
     * Log passkey registration
     */
    public async logPasskeyRegistration(userId: string, deviceInfo?: PasskeyDeviceInfo): Promise<void> {
        this.metrics.totalPasskeys++;
        this.metrics.activePasskeys++;

        await auditLogger.logEvent(
            'PASSKEY_REGISTERED',
            `Passkey registered for user ${userId}`,
            { userId, deviceInfo, totalPasskeys: this.metrics.totalPasskeys },
            'info'
        );
    }

    /**
     * Log passkey deletion
     */
    public async logPasskeyDeletion(userId: string, credentialId: string): Promise<void> {
        this.metrics.activePasskeys = Math.max(0, this.metrics.activePasskeys - 1);

        await auditLogger.logEvent(
            'PASSKEY_DELETED',
            `Passkey deleted for user ${userId}`,
            { userId, credentialId, activePasskeys: this.metrics.activePasskeys },
            'warn'
        );

        // Alert if user has no passkeys left
        if (this.metrics.activePasskeys === 0) {
            await sendSlackAlert(
                `User ${userId} has deleted their last passkey. Account may be vulnerable.`,
                {
                    level: 'warn',
                    title: 'Last Passkey Deleted',
                    metadata: { userId, credentialId }
                }
            );
        }
    }

    /**
     * Log passkey login success
     */
    public async logPasskeyLoginSuccess(userId: string, deviceInfo?: PasskeyDeviceInfo): Promise<void> {
        await auditLogger.logEvent(
            'PASSKEY_LOGIN_SUCCESS',
            `User ${userId} logged in with passkey`,
            { userId, deviceInfo },
            'info'
        );
    }

    /**
     * Log passkey login failure and check for security threats
     */
    public async logPasskeyLoginFailure(userId: string, reason: string, deviceInfo?: PasskeyDeviceInfo): Promise<void> {
        this.metrics.failedLoginAttempts++;

        await auditLogger.logEvent(
            'PASSKEY_LOGIN_FAILURE',
            `Passkey login failed for user ${userId}: ${reason}`,
            { userId, reason, deviceInfo, failedAttempts: this.metrics.failedLoginAttempts },
            'warn'
        );

        // Check if threshold exceeded
        if (this.metrics.failedLoginAttempts >= this.alertThresholds.failedLoginsPerHour) {
            await sendSlackAlert(
                `High number of passkey login failures detected: ${this.metrics.failedLoginAttempts} in the last hour`,
                {
                    level: 'error',
                    title: 'Passkey Login Failures Spike',
                    metadata: { failedAttempts: this.metrics.failedLoginAttempts }
                }
            );
        }
    }

    /**
     * Log account recovery attempt
     */
    public async logRecoveryAttempt(userId: string, email: string): Promise<void> {
        this.metrics.recoveryAttempts++;

        await auditLogger.logEvent(
            'ACCOUNT_RECOVERY_INITIATED',
            `Account recovery initiated for user ${userId}`,
            { userId, email, recoveryAttempts: this.metrics.recoveryAttempts },
            'warn'
        );

        // Alert on multiple recovery attempts
        if (this.metrics.recoveryAttempts >= this.alertThresholds.recoveryAttemptsPerHour) {
            await sendSlackAlert(
                `Multiple account recovery attempts detected: ${this.metrics.recoveryAttempts} in the last hour`,
                {
                    level: 'warn',
                    title: 'Recovery Attempts Spike',
                    metadata: { recoveryAttempts: this.metrics.recoveryAttempts }
                }
            );
        }
    }

    /**
     * Log suspicious activity
     */
    public async logSuspiciousActivity(userId: string, activity: string, metadata?: Record<string, unknown>): Promise<void> {
        this.metrics.suspiciousActivities++;

        await auditLogger.logEvent(
            'SUSPICIOUS_ACTIVITY',
            `Suspicious passkey activity for user ${userId}: ${activity}`,
            { userId, activity, ...metadata, suspiciousCount: this.metrics.suspiciousActivities },
            'error'
        );

        // Immediate alert for suspicious activities
        await sendSlackAlert(
            `Suspicious passkey activity detected: ${activity}`,
            {
                level: 'critical',
                title: 'Passkey Security Alert',
                metadata: { userId, activity, ...metadata }
            }
        );
    }

    /**
     * Get current security metrics
     */
    public getMetrics(): PasskeySecurityMetrics {
        return { ...this.metrics };
    }

    /**
     * Update alert thresholds
     */
    public updateThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
        this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    }

    /**
     * Generate security report
     */
    public generateSecurityReport(): string {
        const report = `
Passkey Security Report
=======================
Total Passkeys: ${this.metrics.totalPasskeys}
Active Passkeys: ${this.metrics.activePasskeys}
Failed Login Attempts (last hour): ${this.metrics.failedLoginAttempts}
Recovery Attempts (last hour): ${this.metrics.recoveryAttempts}
Suspicious Activities (last hour): ${this.metrics.suspiciousActivities}

Alert Thresholds:
- Failed Logins/Hour: ${this.alertThresholds.failedLoginsPerHour}
- Recovery Attempts/Hour: ${this.alertThresholds.recoveryAttemptsPerHour}
- Suspicious Activities/Hour: ${this.alertThresholds.suspiciousActivitiesPerHour}
        `.trim();

        return report;
    }
}

export const passkeySecurityMonitor = PasskeySecurityMonitor.getInstance();
