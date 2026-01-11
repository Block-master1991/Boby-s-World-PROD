/**
 * Logger Core - Professional Logging Engine
 * Integrates PII protection, sanitization, correlation, and formatting
 */

import pino from 'pino';
import { LogLevel, toPinoLevel, getLogLevelFromEnv, type PinoLogLevel } from './LogLevel';
import { contextManager, type LogContext } from './LogContext';
import type { LogEntry } from './LogFormatter';
import { PIIRedactor } from '../security/PIIRedactor';
import { LogSanitizer } from '../security/LogSanitizer';

export interface LoggerCoreConfig {
    level?: LogLevel;
    name?: string;
    version?: string;
    piiProtection?: boolean;
    sanitization?: boolean;
    includeContext?: boolean;
    encryptionEnabled?: boolean;
    tamperDetectionEnabled?: boolean;
}

const isBrowser = typeof window !== 'undefined';
const DEFAULT_CONFIG: LoggerCoreConfig = {
    level: getLogLevelFromEnv(),
    name: 'BobyWorld',
    version: '1.0.0',
    piiProtection: process.env.NODE_ENV === 'production',
    sanitization: true,
    includeContext: true,
    // Disable encryption and tamper detection on client side as they require secrets
    // that should not be exposed via NEXT_PUBLIC_
    encryptionEnabled: !isBrowser && process.env.LOG_ENCRYPTION_ENABLED === 'true',
    tamperDetectionEnabled: !isBrowser && process.env.LOG_TAMPER_DETECTION === 'true'
};

/**
 * Logger Core Class
 */
export class LoggerCore {
    private pinoLogger: pino.Logger;
    private config: LoggerCoreConfig;
    private piiRedactor: PIIRedactor;
    private sanitizer: LogSanitizer;

    constructor(config: Partial<LoggerCoreConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Initialize PII redactor
        this.piiRedactor = new PIIRedactor({
            enabled: this.config.piiProtection,
            strictMode: true
        });

        // Initialize sanitizer
        this.sanitizer = new LogSanitizer({
            enabled: this.config.sanitization
        });

        // Create Pino logger
        this.pinoLogger = this.createPinoLogger();
    }

    /**
     * Create Pino logger instance
     */
    private createPinoLogger(): pino.Logger {
        const isProduction = process.env.NODE_ENV === 'production';
        const isBrowser = typeof window !== 'undefined';

        const pinoConfig: pino.LoggerOptions = {
            level: toPinoLevel(this.config.level!),
            base: {
                name: this.config.name,
                version: this.config.version,
                env: process.env.NODE_ENV
            },
            formatters: {
                level: (label: string) => ({ level: label }),
                log: (obj: Record<string, unknown>) => {
                    if (obj.err) {
                        return {
                            ...obj,
                            err: pino.stdSerializers.err(obj.err as Error)
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
            }
        };

        // Browser-specific config
        if (isBrowser) {
            pinoConfig.browser = {
                asObject: !isProduction,
                transmit: {
                    level: 'info',
                    send: (level: any, logEvent: any) => {
                        if (isProduction && level >= 50) {
                            // Send to error reporting in production
                            console.error('Critical error:', logEvent);
                        }
                    }
                }
            };
        } else {
            // Server-specific config
            if (!isProduction) {
                pinoConfig.transport = {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname'
                    }
                };
            }
        }

        return pino(pinoConfig);
    }

    /**
     * Log at TRACE level
     */
    trace(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.TRACE, message, metadata);
    }

    /**
     * Log at DEBUG level
     */
    debug(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.DEBUG, message, metadata);
    }

    /**
     * Log at INFO level
     */
    info(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.INFO, message, metadata);
    }

    /**
     * Log at WARN level
     */
    warn(message: string, metadata?: Record<string, any>): void {
        this.log(LogLevel.WARN, message, metadata);
    }

    /**
     * Log at ERROR level
     */
    error(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, any>): void {
        let error: Error | undefined;
        let meta: Record<string, unknown> | undefined;

        // Determine if second parameter is error or metadata
        if (errorOrMetadata instanceof Error) {
            error = errorOrMetadata;
            meta = metadata;
        } else if (typeof errorOrMetadata === 'object' && errorOrMetadata !== null) {
            // Check if it's an error-like object
            if ('message' in errorOrMetadata || 'stack' in errorOrMetadata) {
                error = this.normalizeError(errorOrMetadata);
                meta = metadata;
            } else {
                // It's metadata
                meta = errorOrMetadata as Record<string, any>;
            }
        } else if (typeof errorOrMetadata === 'string') {
            // Convert string to Error
            error = new Error(errorOrMetadata);
            meta = metadata;
        } else if (errorOrMetadata) {
            // Unknown type - convert to Error
            error = this.normalizeError(errorOrMetadata);
            meta = metadata;
        } else {
            meta = metadata;
        }

        this.log(LogLevel.ERROR, message, meta, error);
    }

    /**
     * Log at FATAL level
     */
    fatal(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, any>): void {
        let error: Error | undefined;
        let meta: Record<string, any> | undefined;

        if (errorOrMetadata instanceof Error) {
            error = errorOrMetadata;
            meta = metadata;
        } else if (typeof errorOrMetadata === 'object') {
            meta = errorOrMetadata as Record<string, any>;
        } else if (errorOrMetadata) {
            error = this.normalizeError(errorOrMetadata);
            meta = metadata;
        }

        this.log(LogLevel.FATAL, message, meta, error);
    }

    /**
     * Core logging method
     */
    private log(
        level: LogLevel,
        message: string,
        metadata?: Record<string, any>,
        error?: Error
    ): void {
        // Sanitize message
        const sanitizedMessage = this.sanitizer.sanitize(message);

        // Prepare metadata
        let processedMetadata = metadata ? { ...metadata } : {};

        // Apply sanitization
        if (this.config.sanitization) {
            processedMetadata = this.sanitizer.sanitize(processedMetadata);
        }

        // Apply PII redaction
        if (this.config.piiProtection) {
            processedMetadata = this.piiRedactor.redact(processedMetadata);
        }

        // Add context if available
        if (this.config.includeContext) {
            const context = contextManager.getCurrentContext();
            if (context) {
                processedMetadata.correlationId = context.correlationId;

                if (context.userId) {
                    processedMetadata.userId = context.userId;
                }

                if (context.sessionId) {
                    processedMetadata.sessionId = context.sessionId;
                }

                if (context.traceId) {
                    processedMetadata.traceId = context.traceId;
                }
            }
        }

        // Get appropriate Pino method
        const pinoLevel = toPinoLevel(level);
        const pinoMethod = this.pinoLogger[pinoLevel].bind(this.pinoLogger);

        // Log with or without error
        if (error) {
            pinoMethod({ err: error, ...processedMetadata, msg: sanitizedMessage }, sanitizedMessage);
        } else if (Object.keys(processedMetadata).length > 0) {
            pinoMethod({ ...processedMetadata, msg: sanitizedMessage }, sanitizedMessage);
        } else {
            // PASSING STRING AS FIRST ARGUMENT: This ensures Pino/browser-console displays 
            // the message directly instead of as an object { msg: "..." }.
            pinoMethod(sanitizedMessage || '[Empty Message]');
        }
    }

    /**
     * Normalize error-like objects to Error
     */
    private normalizeError(errorOrData: unknown): Error {
        if (errorOrData instanceof Error) {
            return errorOrData;
        }

        if (typeof errorOrData === 'string') {
            const err = new Error(errorOrData);
            err.name = 'LoggedError';
            return err;
        }

        try {
            let errorMessage: string;

            if (typeof errorOrData === 'object' && errorOrData !== null) {
                const obj = errorOrData as Record<string, unknown>;

                if (obj.message) {
                    errorMessage = String(obj.message);
                } else if (obj.error) {
                    errorMessage = String(obj.error);
                } else {
                    errorMessage = JSON.stringify(errorOrData);
                }
            } else {
                errorMessage = String(errorOrData);
            }

            const err = new Error(errorMessage);
            err.name = 'SerializedError';

            // Preserve stack trace if available
            if (typeof errorOrData === 'object' && errorOrData !== null && 'stack' in errorOrData) {
                err.stack = String((errorOrData as Record<string, unknown>).stack);
            }

            return err;
        } catch {
            return new Error('[Unserializable Error Data]');
        }
    }

    /**
     * Create child logger with additional context
     */
    child(bindings: Record<string, unknown>): LoggerCore {
        const childLogger = new LoggerCore(this.config);
        childLogger.pinoLogger = this.pinoLogger.child(bindings);
        return childLogger;
    }

    /**
     * Create logger with specific context
     */
    withContext(context: Partial<LogContext>): ContextualLogger {
        return new ContextualLogger(this, context);
    }

    /**
     * Flush any buffered logs (for graceful shutdown)
     */
    async flush(): Promise<void> {
        if (this.pinoLogger.flush) {
            await this.pinoLogger.flush();
        }
    }

    /**
     * Update PII redactor config
     */
    updatePIIConfig(enabled: boolean): void {
        this.piiRedactor.updateConfig({ enabled });
    }

    /**
     * Update sanitizer config
     */
    updateSanitizerConfig(enabled: boolean): void {
        this.sanitizer.updateConfig({ enabled });
    }
}

/**
 * Contextual Logger - Logger bound to specific context
 */
export class ContextualLogger {
    constructor(
        private core: LoggerCore,
        private context: Partial<LogContext>
    ) { }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        const fullContext = contextManager.createContext(this.context);
        return contextManager.runWithContext(fullContext, fn);
    }

    trace(message: string, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.trace(message, metadata));
    }

    debug(message: string, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.debug(message, metadata));
    }

    info(message: string, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.info(message, metadata));
    }

    warn(message: string, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.warn(message, metadata));
    }

    error(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.error(message, errorOrMetadata, metadata));
    }

    fatal(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void {
        this.run(async () => this.core.fatal(message, errorOrMetadata, metadata));
    }
}
