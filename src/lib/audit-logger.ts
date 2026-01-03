/**
 * Centralized Audit Logger
 * Logs all security-critical events to Firestore and sends Slack alerts
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { sendSlackAlert } from './slack-alert';
import { logger } from 'utils/logger';

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
    | 'ADMIN_ACTION';

export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface AuditEventMetadata {
    userId?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    endpoint?: string;
    errorDetails?: string;
    [key: string]: any;
}

export interface AuditLogEntry {
    eventType: AuditEventType;
    severity: AuditSeverity;
    message: string;
    metadata: AuditEventMetadata;
    timestamp: Timestamp;
    environment: string;
}

class AuditLogger {
    private static instance: AuditLogger;
    private collectionName = 'security_audit_logs';

    private constructor() { }

    public static getInstance(): AuditLogger {
        if (!AuditLogger.instance) {
            AuditLogger.instance = new AuditLogger();
        }
        return AuditLogger.instance;
    }

    /**
     * Log security event to Firestore and optionally send Slack alert
     */
    public async logEvent(
        eventType: AuditEventType,
        message: string,
        metadata: AuditEventMetadata = {},
        severity: AuditSeverity = 'info'
    ): Promise<void> {
        try {
            const db = getFirestore();

            // 1. Sanitize & Encrypt Sensitive Metadata if payload is large or critical
            let processedMetadata = { ...metadata };

            // Professional: We can hash or encrypt IP/Identifiers for privacy
            // For now, we'll ensure the message itself is sanitized
            const sanitizedMessage = message.substring(0, 1000).replace(/<[^>]*>?/gm, '');

            const logEntry: AuditLogEntry = {
                eventType,
                severity,
                message: sanitizedMessage,
                metadata: processedMetadata,
                timestamp: Timestamp.now(),
                environment: process.env.NODE_ENV || 'development'
            };

            // Store in Firestore
            await db.collection(this.collectionName).add(logEntry);

            // Send Slack alert for critical/error events
            if (severity === 'critical' || severity === 'error') {
                await sendSlackAlert(message, {
                    level: severity,
                    title: `Security Event: ${eventType}`,
                    metadata: {
                        ...metadata,
                        eventType,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            logger.log(`[AuditLogger] ${severity.toUpperCase()}: ${eventType} - ${message}`);
        } catch (error) {
            logger.error('[AuditLogger] Failed to log event:', error);
            // Fallback to console logging
            logger.error(`[AUDIT_FALLBACK] ${eventType}: ${message}`, metadata);
        }
    }

    /**
     * Log successful login
     */
    public async logLoginSuccess(userId: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent(
            'LOGIN_SUCCESS',
            `User ${userId} logged in successfully`,
            { ...metadata, userId },
            'info'
        );
    }

    /**
     * Log failed login attempt
     */
    public async logLoginFailure(metadata: AuditEventMetadata, reason: string): Promise<void> {
        await this.logEvent(
            'LOGIN_FAILURE',
            `Login failed: ${reason}`,
            { ...metadata, errorDetails: reason },
            'warn'
        );
    }

    /**
     * Log session violation (fingerprint mismatch, etc.)
     */
    public async logSessionViolation(
        userId: string,
        sessionId: string,
        reason: string,
        metadata: AuditEventMetadata
    ): Promise<void> {
        await this.logEvent(
            'SESSION_VIOLATION',
            `Session violation for user ${userId}: ${reason}`,
            { ...metadata, userId, sessionId, errorDetails: reason },
            'critical'
        );
    }

    /**
     * Log rate limit hit
     */
    public async logRateLimitHit(
        identifier: string,
        endpoint: string,
        metadata: AuditEventMetadata
    ): Promise<void> {
        await this.logEvent(
            'RATE_LIMIT_HIT',
            `Rate limit exceeded for ${identifier} on ${endpoint}`,
            { ...metadata, endpoint },
            'error'
        );
    }

    /**
     * Log CSRF violation
     */
    public async logCsrfViolation(metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent(
            'CSRF_VIOLATION',
            'CSRF token validation failed',
            metadata,
            'critical'
        );
    }

    /**
     * Log Passkey registration
     */
    public async logPasskeyRegistered(userId: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent(
            'PASSKEY_REGISTERED',
            `Passkey registered for user ${userId}`,
            { ...metadata, userId },
            'info'
        );
    }

    /**
     * Log Passkey login success
     */
    public async logPasskeyLoginSuccess(userId: string, metadata: AuditEventMetadata): Promise<void> {
        await this.logEvent(
            'PASSKEY_LOGIN_SUCCESS',
            `User ${userId} logged in with Passkey`,
            { ...metadata, userId },
            'info'
        );
    }

    /**
     * Log Passkey login failure
     */
    public async logPasskeyLoginFailure(metadata: AuditEventMetadata, reason: string): Promise<void> {
        await this.logEvent(
            'PASSKEY_LOGIN_FAILURE',
            `Passkey login failed: ${reason}`,
            { ...metadata, errorDetails: reason },
            'warn'
        );
    }

    /**
     * Query audit logs (for admin dashboard)
     */
    public async queryLogs(
        filters: {
            eventType?: AuditEventType;
            severity?: AuditSeverity;
            userId?: string;
            startDate?: Date;
            endDate?: Date;
        },
        limit: number = 100
    ): Promise<AuditLogEntry[]> {
        try {
            const db = getFirestore();
            let query = db.collection(this.collectionName).orderBy('timestamp', 'desc').limit(limit);

            if (filters.eventType) {
                query = query.where('eventType', '==', filters.eventType) as any;
            }
            if (filters.severity) {
                query = query.where('severity', '==', filters.severity) as any;
            }
            if (filters.userId) {
                query = query.where('metadata.userId', '==', filters.userId) as any;
            }
            if (filters.startDate) {
                query = query.where('timestamp', '>=', Timestamp.fromDate(filters.startDate)) as any;
            }
            if (filters.endDate) {
                query = query.where('timestamp', '<=', Timestamp.fromDate(filters.endDate)) as any;
            }

            const snapshot = await query.get();
            return snapshot.docs.map(doc => doc.data() as AuditLogEntry);
        } catch (error) {
            logger.error('[AuditLogger] Failed to query logs:', error);
            return [];
        }
    }
}

export const auditLogger = AuditLogger.getInstance();
