/**
 * Security Logger - Central Monitoring System (SIEM)
 * Unifies security logs and sends alerts to external systems
 */

import { logger } from 'utils/logger';
import { sendSlackAlert, type SlackAlertOptions } from './slack-alert';

export enum SecurityEventLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export interface SecurityEvent {
    type: string;
    level: SecurityEventLevel;
    message: string;
    userId?: string;
    ip?: string;
    endpoint?: string;
    evidence?: unknown;
    timestamp: number;
}

export class SecurityLogger {
    private static instance: SecurityLogger;

    private constructor() { }

    public static getInstance(): SecurityLogger {
        if (!SecurityLogger.instance) {
            SecurityLogger.instance = new SecurityLogger();
        }
        return SecurityLogger.instance;
    }

    /**
     * Log security event and send to external systems
     */
    public async logEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
        const fullEvent: SecurityEvent = {
            ...event,
            timestamp: Date.now()
        };

        // 1. Local logging in console
        logger.warn(`[SECURITY_EVENT][${fullEvent.level.toUpperCase()}] ${fullEvent.type}: ${fullEvent.message}`, fullEvent.evidence || '');

        // 2. Send Slack alert for critical events
        if (fullEvent.level === SecurityEventLevel.CRITICAL || fullEvent.level === SecurityEventLevel.ERROR) {
            const alertOptions: SlackAlertOptions = {
                level: fullEvent.level,
                title: `Security Event: ${fullEvent.type}`,
                metadata: {
                    Type: fullEvent.type,
                    Level: fullEvent.level,
                    User: fullEvent.userId || 'Guest',
                    IP: fullEvent.ip || 'Unknown',
                    Endpoint: fullEvent.endpoint || 'N/A',
                    Evidence: fullEvent.evidence ? JSON.stringify(fullEvent.evidence) : 'None'
                }
            };
            
            await sendSlackAlert(fullEvent.message, alertOptions);
        }

        // 3. Simulate sending to Sentry/Datadog
        // In Prod: Sentry.captureMessage(fullEvent.message, { level: fullEvent.level, extra: fullEvent });
    }
}

export const securityLogger = SecurityLogger.getInstance();
