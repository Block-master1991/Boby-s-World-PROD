import pino from 'pino';
import { LogSanitizer } from '../security/LogSanitizer';
import { PIIRedactor } from '../security/PIIRedactor';
import { ContextualLogger } from './ContextualLogger';
import { contextManager, type LogContext } from './LogContext';
import type { ILoggerCore, LoggerCoreConfig } from './LoggerTypes';
import { getLogLevelFromEnv, LogLevel, toPinoLevel } from './LogLevel';

const isBrowser = typeof window !== 'undefined';
const DEFAULT_CONFIG: LoggerCoreConfig = {
    level: getLogLevelFromEnv(),
    name: 'BobyWorld',
    version: '1.0.0',
    piiProtection: process.env['NODE_ENV'] === 'production',
    sanitization: true,
    includeContext: true,
    encryptionEnabled: !isBrowser && process.env['LOG_ENCRYPTION_ENABLED'] === 'true',
    tamperDetectionEnabled: !isBrowser && process.env['LOG_TAMPER_DETECTION'] === 'true'
};

/**
 * Logger Core Class
 */
export class LoggerCore implements ILoggerCore {
    private pinoLogger: pino.Logger;
    private config: LoggerCoreConfig;
    private piiRedactor: PIIRedactor;
    private sanitizer: LogSanitizer;

    constructor(config: Partial<LoggerCoreConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.piiRedactor = new PIIRedactor({ enabled: !!this.config.piiProtection, strictMode: true });
        this.sanitizer = new LogSanitizer({ enabled: !!this.config.sanitization });
        this.pinoLogger = this.createPinoLogger();
    }

    private createPinoLogger(): pino.Logger {
        const isProduction = process.env['NODE_ENV'] === 'production';
        const pinoConfig: pino.LoggerOptions = {
            level: toPinoLevel(this.config.level!),
            base: { name: this.config.name, version: this.config.version, env: process.env['NODE_ENV'] },
            formatters: {
                level: (label: string) => ({ level: label }),
                log: (obj: Record<string, unknown>) => (obj['err'] ? { ...obj, err: pino.stdSerializers.err(obj['err'] as Error) } : obj)
            },
            serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err, req: pino.stdSerializers.req, res: pino.stdSerializers.res }
        };

        if (typeof window !== 'undefined') {
            pinoConfig.browser = {
                asObject: !isProduction,
                transmit: {
                    level: 'info',
                    send: (level: unknown, logEvent: unknown) => {
                        if (isProduction && (level as number) >= 50) console.error('Critical error:', logEvent);
                    }
                }
            };
        } else if (!isProduction) {
            pinoConfig.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } };
        }
        return pino(pinoConfig);
    }

    trace(message: string, metadata?: Record<string, unknown>): void { this.log(LogLevel.TRACE, message, metadata); }
    debug(message: string, metadata?: Record<string, unknown>): void { this.log(LogLevel.DEBUG, message, metadata); }
    info(message: string, metadata?: Record<string, unknown>): void { this.log(LogLevel.INFO, message, metadata); }
    warn(message: string, metadata?: Record<string, unknown>): void { this.log(LogLevel.WARN, message, metadata); }

    error(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void {
        const { error, meta } = this.parseErrorArgs(errorOrMetadata, metadata);
        this.log(LogLevel.ERROR, message, meta, error);
    }

    fatal(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void {
        const { error, meta } = this.parseErrorArgs(errorOrMetadata, metadata);
        this.log(LogLevel.FATAL, message, meta, error);
    }

    private parseErrorArgs(arg: unknown, metadata?: Record<string, unknown>) {
        if (arg instanceof Error) return { error: arg, meta: metadata };
        if (typeof arg === 'object' && arg !== null) {
            if ('message' in arg || 'stack' in arg) return { error: this.normalizeError(arg), meta: metadata };
            return { meta: arg as Record<string, unknown> };
        }
        return { error: arg ? this.normalizeError(arg) : undefined, meta: metadata };
    }

    private log(level: LogLevel, message: string, metadata?: Record<string, unknown>, error?: Error): void {
        const sanitizedMsg = this.sanitizer.sanitize(message);
        let meta = metadata ? { ...metadata } : {};

        if (this.config.sanitization) meta = this.sanitizer.sanitize(meta);
        if (this.config.piiProtection) meta = this.piiRedactor.redact(meta);
        if (this.config.includeContext) this.applyContext(meta);

        const pinoMethod = this.pinoLogger[toPinoLevel(level)].bind(this.pinoLogger);
        if (error) pinoMethod({ err: error, ...meta, msg: sanitizedMsg }, sanitizedMsg);
        else if (Object.keys(meta).length > 0) pinoMethod({ ...meta, msg: sanitizedMsg }, sanitizedMsg);
        else pinoMethod(sanitizedMsg || '[Empty Message]');
    }

    private applyContext(meta: Record<string, unknown>): void {
        const context = contextManager.getCurrentContext();
        if (context) {
            meta['correlationId'] = context.correlationId;
            if (context.userId) meta['userId'] = context.userId;
            if (context.sessionId) meta['sessionId'] = context.sessionId;
            if (context.traceId) meta['traceId'] = context.traceId;
        }
    }

    private normalizeError(errorOrData: unknown): Error {
        if (errorOrData instanceof Error) return errorOrData;
        if (typeof errorOrData === 'string') {
            const err = new Error(errorOrData);
            err.name = 'LoggedError';
            return err;
        }
        const record = errorOrData as Record<string, unknown>;
        const msg = (typeof errorOrData === 'object' && errorOrData !== null) 
            ? String(record['message'] || record['error'] || JSON.stringify(errorOrData)) 
            : String(errorOrData);
        const err = new Error(msg);
        err.name = 'SerializedError';
        if (errorOrData && typeof errorOrData === 'object' && 'stack' in errorOrData) {
            err.stack = String(record['stack']);
        }
        return err;
    }

    child(bindings: Record<string, unknown>): LoggerCore {
        const childLogger = new LoggerCore(this.config);
        childLogger.pinoLogger = this.pinoLogger.child(bindings);
        return childLogger;
    }

    withContext(context: Partial<LogContext>): ContextualLogger {
        return new ContextualLogger(this, context);
    }

    async flush(): Promise<void> {
        if (this.pinoLogger.flush) await this.pinoLogger.flush();
    }

    updatePIIConfig(enabled: boolean): void {
        this.piiRedactor.updateConfig({ enabled });
    }

    updateSanitizerConfig(enabled: boolean): void {
        this.sanitizer.updateConfig({ enabled });
    }
}
