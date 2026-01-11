/**
 * Professional Logger utility for Boby World
 * High-performance, structured logging with environment-aware behavior
 * 
 * This is a backward-compatible wrapper around the new professional logging system
 * Located at: src/lib/logging/
 */

import pino from 'pino';
import { professionalLogger, type LogContext } from '../lib/logging';

// Determine if we're in browser or Node.js environment
const isBrowser = typeof window !== 'undefined';
const isProduction = process.env.NODE_ENV === 'production';

// Create Pino logger configuration (kept for compatibility)
const loggerConfig = {
    level: isProduction ? 'info' : 'debug',
    formatters: {
        level: (label: string) => {
            return { level: label };
        },
        log: (obj: Record<string, unknown>) => {
            if (obj.err) {
                // Handle error objects specially
                return {
                    ...obj,
                    err: pino.stdSerializers.err(obj.err as any)
                };
            }
            return obj;
        }
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
    },
    // In browser, use console transport
    ...(isBrowser ? {
        browser: {
            asObject: !isProduction, // Pretty print in development
            transmit: {
                level: 'info',
                send: (level: string | number, logEvent: any) => {
                    // Could send to external logging service here
                    const numericLevel = typeof level === 'string' ? 30 : level; // Default to info if string
                    if (isProduction && numericLevel >= 50) { // Error level and above
                        // Send to error reporting service
                        console.error('Critical error:', logEvent);
                    }
                }
            }
        }
    } : {
        // Server-side configuration
        transport: !isProduction ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        } : undefined
    })
};

// Create the logger instance (kept for compatibility)
const pinoLogger = pino(loggerConfig);

// Add custom child logger for BobyWorld context
const pinoLoggerInstance = pinoLogger.child({
    component: 'BobyWorld',
    version: process.env.npm_package_version || '1.0.0'
});

export { pinoLoggerInstance as pinoLogger };

// Legacy interface for backward compatibility - this is the main export for compatibility
export class Logger {
    private isProd = isProduction;

    /**
     * Normalize various error types to a standard Error object
     * @private
     */
    private normalizeError(errorOrData: Error | string | unknown): Error | undefined {
        if (!errorOrData) return undefined;

        // Already an Error object
        if (errorOrData instanceof Error) return errorOrData;

        // String message - convert to Error
        if (typeof errorOrData === 'string') {
            const err = new Error(errorOrData);
            err.name = 'LoggedError';
            return err;
        }

        // Unknown/object types - serialize to Error
        try {
            let errorMessage: string;

            if (typeof errorOrData === 'object' && errorOrData !== null) {
                // Try to extract useful information from the object
                const obj = errorOrData as any;

                // Check for common error-like properties
                if (obj.message) {
                    errorMessage = String(obj.message);
                } else if (obj.error) {
                    errorMessage = String(obj.error);
                } else {
                    // Serialize the entire object
                    errorMessage = JSON.stringify(errorOrData);
                }
            } else {
                errorMessage = String(errorOrData);
            }

            const err = new Error(errorMessage);
            err.name = 'SerializedError';

            // Preserve stack trace if available
            if (typeof errorOrData === 'object' && errorOrData !== null && 'stack' in errorOrData) {
                err.stack = String((errorOrData as any).stack);
            }

            return err;
        } catch {
            // Fallback for unserializable objects
            return new Error('[Unserializable Error Data]');
        }
    }

    /**
     * Standard log for informative messages.
     * SILENT in production.
     */
    log(message: string, ...args: unknown[]) {
        const metadata = args.length > 0 ? { args } : undefined;
        professionalLogger.info(message, metadata);
    }

    /**
     * Detailed debug information.
     * SILENT in production.
     */
    debug(message: string, ...args: unknown[]) {
        const metadata = args.length > 0 ? { args } : undefined;
        professionalLogger.debug(message, metadata);
    }

    /**
     * Warnings about potential issues.
     * ALWAYS visible.
     */
    warn(message: string, ...args: unknown[]) {
        const metadata = args.length > 0 ? { args } : undefined;
        professionalLogger.warn(message, metadata);
    }

    /**
     * Critical errors.
     * ALWAYS visible.
     * @param message - Error message
     * @param errorOrData - Error object, string, or any data to log (will be normalized to Error)
     * @param args - Additional arguments to log
     */
    error(message: string, errorOrData?: Error | string | unknown, ...args: unknown[]) {
        const metadata = args.length > 0 ? { args } : undefined;
        professionalLogger.error(message, errorOrData, metadata);
    }

    /**
     * Special logging for performance-sensitive game loops.
     * SILENT in production.
     */
    gameLoop(message: string, ...args: unknown[]) {
        if (!this.isProd) {
            const metadata = args.length > 0 ? { gameLoop: true, args } : { gameLoop: true };
            professionalLogger.debug(message, metadata);
        }
    }

    /**
     * Performance timing logs
     */
    timing(label: string, duration: number, metadata?: Record<string, unknown>) {
        professionalLogger.info(`Performance: ${label}`, {
            timing: { label, duration },
            ...metadata
        });
    }

    /**
     * Security-related logs (always logged)
     */
    security(message: string, metadata?: Record<string, unknown>) {
        professionalLogger.warn(`SECURITY: ${message}`, {
            security: true,
            ...metadata
        });
    }

    /**
     * Audit logs for important actions
     */
    audit(action: string, userId?: string, metadata?: Record<string, unknown>) {
        professionalLogger.info(`AUDIT: ${action}`, {
            audit: true,
            action,
            userId,
            timestamp: new Date().toISOString(),
            ...metadata
        });
    }

    /**
     * Create logger with specific context
     */
    withContext(context: Partial<LogContext>) {
        return professionalLogger.withContext(context);
    }

    /**
     * Create child logger with bindings
     */
    child(bindings: Record<string, unknown>) {
        return professionalLogger.child(bindings);
    }
}

// Export singleton instance - this is the main logger export for backward compatibility
export const logger = new Logger();
export const legacyLogger = logger;

// Export types for TypeScript users
export type { Logger as PinoLogger } from 'pino';

// Re-export professional logger for advanced usage
export { professionalLogger } from '../lib/logging';
