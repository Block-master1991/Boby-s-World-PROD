/**
 * Enhanced Security Audit Logger
 * Professional audit logging with encryption, tamper detection, and compliance features
 */

import { professionalLogger } from '../index';
import { LogEncryption } from '../security/LogEncryption';
import { TamperDetection, type SignedLogEntry } from '../security/TamperDetection';
import { rateLimitMiddleware } from '../middleware/RateLimitMiddleware';


export type AuditEventType =
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'LOGOUT'
    | 'SESSION_VIOLATION'
    | 'RATE_LIMIT_HIT'
    | 'CSRF_VIOLATION'
    | 'PASSKEY_REGISTERED'
    | 'PASSKEY_LOGIN_SUCCESS'
    | 'PASSKEY_LOGIN_FAILURE'
    | 'SUSPICIOUS_ACTIVITY'
    | 'TOKEN_REFRESH'
    | 'SESSION_EXPIRED'
    | 'TRANSACTION'
    | 'ACCOUNT_RECOVERY_INITIATED'
    | 'PASSKEY_DELETED'
    | 'ADMIN_ACTION'
    | 'DATA_ACCESS'
    | 'DATA_MODIFICATION'
    | 'DATA_DELETION'
    | 'CONFIG_CHANGE'
    | 'PRIVILEGE_ESCALATION';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface AuditEventMetadata {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    endpoint?: string;
    errorDetails?: string;
    complianceFlags?: string[];
    [key: string]: any;
}

export interface EnhancedAuditLogEntry {
    eventType: AuditEventType;
    severity: AuditSeverity;
    message: string;
    metadata: AuditEventMetadata;
    timestamp: number;
    environment: string;
    correlationId?: string;
    encrypted?: boolean;
    signature?: string;
    complianceLevel?: 'GDPR' | 'CCPA' | 'SOC2' | 'HIPAA';
}

/**
 * Enhanced Audit Logger Configuration
 */
export interface AuditLoggerConfig {
    enableEncryption?: boolean;
    enableTamperDetection?: boolean;
    enableRateLimiting?: boolean;
    storage?: 'firestore' | 'file' | 'database' | 'memory';
    retention?: {
        enabled: boolean;
        days: number;
    };
}

const DEFAULT_CONFIG: AuditLoggerConfig = {
    enableEncryption: process.env.NODE_ENV === 'production',
    enableTamperDetection: process.env.NODE_ENV === 'production',
    enableRateLimiting: true,
    storage: 'memory', // Default to memory, can be overridden
    retention: {
        enabled: true,
        days: 365 // 1 year default
    }
};

/**
 * Enhanced Security Audit Logger Class
 */
export class EnhancedAuditLogger {
    private static instance: EnhancedAuditLogger;
    private config: AuditLoggerConfig;
    private encryption: LogEncryption;
    private tamperDetection: TamperDetection;
    private auditLog: SignedLogEntry[] = []; // In-memory store

    private constructor(config: Partial<AuditLoggerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Initialize security features
        this.encryption = new LogEncryption({
            enabled: this.config.enableEncryption,
            encryptedFields: ['password', 'token', 'secret', 'apiKey', 'privateKey', 'ssn', 'creditCard']
        });

        this.tamperDetection = new TamperDetection({
            enabled: this.config.enableTamperDetection,
            algorithm: 'sha256',
            includeChain: true,
            alertOnTampering: true
        });
    }

    public static getInstance(config?: Partial<AuditLoggerConfig>): EnhancedAuditLogger {
        if (!EnhancedAuditLogger.instance) {
            EnhancedAuditLogger.instance = new EnhancedAuditLogger(config);
        }
        return EnhancedAuditLogger.instance;
    }

    /**
     * Log security event with full protection
     */
    public async logEvent(
        eventType: AuditEventType,
        message: string,
        metadata: AuditEventMetadata = {},
        severity: AuditSeverity = 'info',
        complianceLevel?: 'GDPR' | 'CCPA' | 'SOC2' | 'HIPAA'
    ): Promise<void> {
        try {
            // 1. Rate limiting check
            if (this.config.enableRateLimiting) {
                const rateLimitResult = await rateLimitMiddleware.checkLimit(
                    metadata.userId,
                    metadata.endpoint
                );

                if (!rateLimitResult.allowed) {
                    professionalLogger.warn('Audit log rate limit exceeded', {
                        eventType,
                        userId: metadata.userId,
                        endpoint: metadata.endpoint,
                        resetAt: new Date(rateLimitResult.resetAt).toISOString()
                    });
                    return; // Don't log if rate limited
                }
            }

            // 2. Create log entry
            const logEntry: EnhancedAuditLogEntry = {
                eventType,
                severity,
                message,
                metadata: { ...metadata },
                timestamp: Date.now(),
                environment: process.env.NODE_ENV || 'development',
                complianceLevel
            };

            // 3. Encrypt sensitive fields if enabled
            if (this.config.enableEncryption) {
                logEntry.metadata = this.encryption.encryptFields(logEntry.metadata);
                logEntry.encrypted = true;
            }

            // 4. Sign entry for tamper detection
            let signedEntry: SignedLogEntry | null = null;
            if (this.config.enableTamperDetection) {
                signedEntry = this.tamperDetection.sign(logEntry);
                if (signedEntry) {
                    logEntry.signature = signedEntry.signature;
                }
            }

            // 5. Store audit log
            await this.storeAuditLog(logEntry, signedEntry);

            // 6. Log to professional logger
            const logLevel = this.mapSeverityToLogLevel(severity);
            professionalLogger[logLevel](`[AUDIT] ${eventType}: ${message}`, {
                audit: true,
                eventType,
                severity,
                complianceLevel,
                ...metadata
            });

            // 7. Send alerts for critical events
            if (severity === 'critical' || severity === 'error') {
                await this.sendCriticalAlert(eventType, message, metadata, severity);
            }

        } catch (error) {
            // Fallback logging - never fail silently
            professionalLogger.error('[EnhancedAuditLogger] Failed to log audit event', error, {
                eventType,
                message,
                severity
            });
        }
    }

    /**
     * Store audit log entry
     */
    private async storeAuditLog(
        entry: EnhancedAuditLogEntry,
        signedEntry: SignedLogEntry | null
    ): Promise<void> {
        switch (this.config.storage) {
            case 'memory':
                if (signedEntry) {
                    this.auditLog.push(signedEntry);
                }
                break;

            case 'firestore':
                // TODO: Implement Firestore storage
                // const db = getFirestore();
                // await db.collection('security_audit_logs').add(entry);
                break;

            case 'file':
                // TODO: Implement file storage
                break;

            case 'database':
                // TODO: Implement database storage
                break;
        }
    }

    /**
     * Send critical alert
     */
    private async sendCriticalAlert(
        eventType: AuditEventType,
        message: string,
        metadata: AuditEventMetadata,
        severity: AuditSeverity
    ): Promise<void> {
        // TODO: Implement Slack/email alerts
        // For now, just log to console
        // eslint-disable-next-line no-console
        console.error('[CRITICAL AUDIT EVENT]', {
            eventType,
            message,
            severity,
            timestamp: new Date().toISOString(),
            userId: metadata.userId,
            ipAddress: metadata.ipAddress
        });
    }

    /**
     * Map severity to log level
     */
    private mapSeverityToLogLevel(severity: AuditSeverity): 'info' | 'warn' | 'error' | 'fatal' {
        switch (severity) {
            case 'info':
                return 'info';
            case 'warn':
                return 'warn';
            case 'error':
                return 'error';
            case 'critical':
                return 'fatal';
            default:
                return 'info';
        }
    }

    /**
     * Verify audit log integrity
     */
    public verifyIntegrity(): {
        valid: boolean;
        totalEntries: number;
        errors: Array<{ index: number; errors: string[] }>;
    } {
        if (!this.config.enableTamperDetection || this.auditLog.length === 0) {
            return {
                valid: true,
                totalEntries: this.auditLog.length,
                errors: []
            };
        }

        const result = this.tamperDetection.verifyChain(this.auditLog);

        return {
            valid: result.valid,
            totalEntries: this.auditLog.length,
            errors: result.errors
        };
    }

    /**
     * Query audit logs
     */
    public queryLogs(filters: {
        eventType?: AuditEventType;
        severity?: AuditSeverity;
        userId?: string;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): EnhancedAuditLogEntry[] {
        let results = this.auditLog
            .map(entry => entry.data as EnhancedAuditLogEntry)
            .filter(entry => {
                if (filters.eventType && entry.eventType !== filters.eventType) {
                    return false;
                }
                if (filters.severity && entry.severity !== filters.severity) {
                    return false;
                }
                if (filters.userId && entry.metadata.userId !== filters.userId) {
                    return false;
                }
                if (filters.startDate && entry.timestamp < filters.startDate.getTime()) {
                    return false;
                }
                if (filters.endDate && entry.timestamp > filters.endDate.getTime()) {
                    return false;
                }
                return true;
            });

        // Sort by timestamp descending
        results.sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit
        if (filters.limit) {
            results = results.slice(0, filters.limit);
        }

        return results;
    }

    /**
     * Export audit logs for compliance
     */
    public exportLogs(format: 'json' | 'csv' = 'json'): string {
        const logs = this.queryLogs({ limit: 10000 });

        if (format === 'json') {
            return JSON.stringify(logs, null, 2);
        }

        // CSV format
        if (logs.length === 0) {
            return '';
        }

        const headers = ['Timestamp', 'Event Type', 'Severity', 'Message', 'User ID', 'IP Address'];
        const rows = logs.map(log => [
            new Date(log.timestamp).toISOString(),
            log.eventType,
            log.severity,
            log.message,
            log.metadata.userId || '',
            log.metadata.ipAddress || ''
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
    }

    /**
     * Clear old logs (retention policy)
     */
    public async applyRetentionPolicy(): Promise<number> {
        if (!this.config.retention?.enabled) {
            return 0;
        }

        const cutoffDate = Date.now() - (this.config.retention.days * 24 * 60 * 60 * 1000);
        const beforeCount = this.auditLog.length;

        this.auditLog = this.auditLog.filter(entry => {
            const logEntry = entry.data as EnhancedAuditLogEntry;
            return logEntry.timestamp >= cutoffDate;
        });

        const deletedCount = beforeCount - this.auditLog.length;

        if (deletedCount > 0) {
            professionalLogger.info(`Applied retention policy: deleted ${deletedCount} old audit logs`);
        }

        return deletedCount;
    }

    // Convenience methods for common events

    public async logLoginSuccess(userId: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('LOGIN_SUCCESS', `User ${userId} logged in successfully`, { ...metadata, userId }, 'info');
    }

    public async logLoginFailure(metadata: AuditEventMetadata, reason: string): Promise<void> {
        await this.logEvent('LOGIN_FAILURE', `Login failed: ${reason}`, { ...metadata, errorDetails: reason }, 'warn');
    }

    public async logSessionViolation(userId: string, reason: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('SESSION_VIOLATION', `Session violation for user ${userId}: ${reason}`, { ...metadata, userId, errorDetails: reason }, 'critical');
    }

    public async logTransaction(userId: string, type: string, amount: number, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('TRANSACTION', `Transaction: ${type}`, { ...metadata, userId, transactionType: type, amount }, 'info', 'SOC2');
    }

    public async logDataAccess(userId: string, resource: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('DATA_ACCESS', `User ${userId} accessed ${resource}`, { ...metadata, userId, resource }, 'info', 'GDPR');
    }

    public async logDataModification(userId: string, resource: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('DATA_MODIFICATION', `User ${userId} modified ${resource}`, { ...metadata, userId, resource }, 'warn', 'GDPR');
    }

    public async logDataDeletion(userId: string, resource: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('DATA_DELETION', `User ${userId} deleted ${resource}`, { ...metadata, userId, resource }, 'warn', 'GDPR');
    }

    public async logAdminAction(adminId: string, action: string, target: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent('ADMIN_ACTION', `Admin ${adminId} performed ${action} on ${target}`, { ...metadata, adminId, action, target }, 'warn', 'SOC2');
    }
}

/**
 * Default instance
 */
export const enhancedAuditLogger = EnhancedAuditLogger.getInstance();

/**
 * Export for convenience
 */
export default enhancedAuditLogger;
