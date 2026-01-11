/**
 * Professional Logging System - Main Entry Point
 * @module lib/logging
 */

// Core exports
export { LoggerCore, ContextualLogger } from './core/LoggerCore';
export { LogLevel, toPinoLevel, fromPinoLevel, getLogLevelFromEnv } from './core/LogLevel';
export { contextManager, withContext, getCorrelationId, type LogContext } from './core/LogContext';
export { LogFormatter, productionFormatter, developmentFormatter, getFormatter } from './core/LogFormatter';

import type { LogContext } from './core/LogContext';

// Security exports - Phase 1
export { PIIRedactor, defaultPIIRedactor, redactPII, type PIIRedactionConfig } from './security/PIIRedactor';
export { LogSanitizer, defaultSanitizer, sanitizeLog, type SanitizerConfig } from './security/LogSanitizer';

// Security exports - Phase 2
export {
    LogEncryption,
    defaultEncryption,
    encryptLog,
    decryptLog,
    type EncryptionConfig,
    type EncryptedData
} from './security/LogEncryption';

export {
    TamperDetection,
    defaultTamperDetection,
    signLog,
    verifyLog,
    type TamperDetectionConfig,
    type SignedLogEntry,
    type VerificationResult
} from './security/TamperDetection';

// Middleware exports - Phase 1
export {
    CorrelationMiddleware,
    correlationMiddleware,
    withCorrelation,
    getCurrentCorrelationId,
    type CorrelationConfig
} from './middleware/CorrelationMiddleware';

// Middleware exports - Phase 2
export {
    RateLimitMiddleware,
    rateLimitMiddleware,
    checkLogRateLimit,
    type RateLimitConfig,
    type RateLimitResult
} from './middleware/RateLimitMiddleware';

// Middleware exports - Phase 3
export {
    BufferingMiddleware,
    bufferingMiddleware,
    createBuffering,
    type BufferingConfig,
    type BufferedLogEntry
} from './middleware/BufferingMiddleware';

export {
    SamplingMiddleware,
    samplingMiddleware,
    shouldSampleLog,
    createSamplingWithRules,
    commonPriorityRules,
    type SamplingConfig,
    type SampledLogEntry,
    type SamplingStats
} from './middleware/SamplingMiddleware';

// Transport exports - Phase 3
export {
    ConsoleTransport,
    consoleTransport,
    logToConsole,
    type ConsoleTransportConfig
} from './transport/ConsoleTransport';

// Specialized Loggers - Phase 4
export {
    PerformanceLogger,
    performanceLogger,
    type PerformanceMetric,
    type PerformanceThresholds,
    type PerformanceLoggerConfig
} from './specialized/PerformanceLogger';

export {
    BusinessLogger,
    businessLogger,
    type BusinessEventType,
    type BusinessEvent
} from './specialized/BusinessLogger';

// Services - Phase 4
export {
    LogQueryService,
    logQueryService,
    type LogQueryFilters,
    type LogQueryResult,
    type LogStorageBackend
} from './service/LogQueryService';

export {
    RetentionService,
    retentionService,
    type RetentionConfig,
    type RetentionPolicy
} from './service/RetentionService';


// Specialized loggers
export {
    EnhancedAuditLogger,
    enhancedAuditLogger,
    type AuditEventType,
    type AuditSeverity,
    type AuditEventMetadata,
    type EnhancedAuditLogEntry,
    type AuditLoggerConfig
} from './specialized/EnhancedAuditLogger';

// Create default logger instance
import { LoggerCore } from './core/LoggerCore';

/**
 * Default logger instance - backward compatible with existing logger
 */
export const professionalLogger = new LoggerCore({
    name: 'BobyWorld',
    version: process.env.npm_package_version || '1.0.0',
    piiProtection: process.env.NODE_ENV === 'production',
    sanitization: true,
    includeContext: true
});

/**
 * Convenience exports for common operations
 */
export const logger = {
    // Basic logging
    trace: (message: string, metadata?: Record<string, any>) =>
        professionalLogger.trace(message, metadata),

    debug: (message: string, metadata?: Record<string, any>) =>
        professionalLogger.debug(message, metadata),

    info: (message: string, metadata?: Record<string, any>) =>
        professionalLogger.info(message, metadata),

    warn: (message: string, metadata?: Record<string, any>) =>
        professionalLogger.warn(message, metadata),

    error: (message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, any>) =>
        professionalLogger.error(message, errorOrMetadata, metadata),

    fatal: (message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, any>) =>
        professionalLogger.fatal(message, errorOrMetadata, metadata),

    // Contextual logging
    withContext: (context: Partial<LogContext>) =>
        professionalLogger.withContext(context),

    // Child logger
    child: (bindings: Record<string, any>) =>
        professionalLogger.child(bindings),

    // Utility
    flush: () => professionalLogger.flush()
};

/**
 * Default export for convenience
 */
export default logger;
