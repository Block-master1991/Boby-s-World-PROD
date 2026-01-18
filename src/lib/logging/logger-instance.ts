import type { LogContext } from './core/LogContext';
import { LoggerCore } from './core/LoggerCore';

/**
 * Default logger instance - backward compatible with existing logger
 */
export const professionalLogger = new LoggerCore({
    name: 'BobyWorld',
    version: process.env['npm_package_version'] || '1.0.0',
    piiProtection: process.env['NODE_ENV'] === 'production',
    sanitization: true,
    includeContext: true
});

/**
 * Convenience exports for common operations
 */
export const logger = {
    // Basic logging
    trace: (message: string, metadata?: Record<string, unknown>) =>
        professionalLogger.trace(message, metadata),

    debug: (message: string, metadata?: Record<string, unknown>) =>
        professionalLogger.debug(message, metadata),

    info: (message: string, metadata?: Record<string, unknown>) =>
        professionalLogger.info(message, metadata),

    warn: (message: string, metadata?: Record<string, unknown>) =>
        professionalLogger.warn(message, metadata),

    error: (message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>) =>
        professionalLogger.error(message, errorOrMetadata, metadata),

    fatal: (message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>) =>
        professionalLogger.fatal(message, errorOrMetadata, metadata),

    // Contextual logging
    withContext: (context: Partial<LogContext>) =>
        professionalLogger.withContext(context),

    // Child logger
    child: (bindings: Record<string, unknown>) =>
        professionalLogger.child(bindings),

    // Utility
    flush: () => professionalLogger.flush()
};
