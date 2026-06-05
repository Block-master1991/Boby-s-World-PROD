/**
 * Professional Logging System - Main Entry Point
 * @module lib/logging
 */

// Core exports
export { ContextualLogger } from "./core/ContextualLogger";
export { contextManager, getCorrelationId, withContext, type LogContext } from "./core/LogContext";
export {
  developmentFormatter,
  getFormatter,
  LogFormatter,
  productionFormatter,
} from "./core/LogFormatter";
export { LoggerCore } from "./core/LoggerCore";
export type { ILoggerCore, LoggerCoreConfig } from "./core/LoggerTypes";
export { fromPinoLevel, getLogLevelFromEnv, LogLevel, toPinoLevel } from "./core/LogLevel";

// Security exports - Phase 1
export {
  defaultSanitizer,
  LogSanitizer,
  sanitizeLog,
  type SanitizerConfig,
} from "./security/LogSanitizer";
export {
  defaultPIIRedactor,
  PIIRedactor,
  redactPII,
  type PIIRedactionConfig,
} from "./security/PIIRedactor";

// Security exports - Phase 2
export type { EncryptedData, EncryptionConfig } from "./security/EncryptionTypes";
export { decryptLog, defaultEncryption, encryptLog, LogEncryption } from "./security/LogEncryption";

export {
  defaultTamperDetection,
  signLog,
  TamperDetection,
  verifyLog,
  type SignedLogEntry,
  type TamperDetectionConfig,
  type VerificationResult,
} from "./security/TamperDetection";

// Middleware exports - Phase 1
export {
  CorrelationMiddleware,
  correlationMiddleware,
  getCurrentCorrelationId,
  withCorrelation,
  type CorrelationConfig,
} from "./middleware/CorrelationMiddleware";

// Middleware exports - Phase 2
export {
  checkLogRateLimit,
  RateLimitMiddleware,
  rateLimitMiddleware,
  type RateLimitConfig,
  type RateLimitResult,
} from "./middleware/RateLimitMiddleware";

// Middleware exports - Phase 3
export {
  BufferingMiddleware,
  bufferingMiddleware,
  createBuffering,
  type BufferedLogEntry,
  type BufferingConfig,
} from "./middleware/BufferingMiddleware";

export {
  createSamplingWithRules,
  SamplingMiddleware,
  samplingMiddleware,
  shouldSampleLog,
} from "./middleware/SamplingMiddleware";

export { commonPriorityRules } from "./middleware/SamplingRules";

export type { SampledLogEntry, SamplingConfig, SamplingStats } from "./types/SamplingTypes";

// Transport exports - Phase 3
export {
  ConsoleTransport,
  consoleTransport,
  logToConsole,
  type ConsoleTransportConfig,
} from "./transport/ConsoleTransport";

// Specialized Loggers - Phase 4
export {
  PerformanceLogger,
  performanceLogger,
  type PerformanceLoggerConfig,
  type PerformanceMetric,
  type PerformanceThresholds,
} from "./specialized/PerformanceLogger";

export { BusinessLogger, businessLogger } from "./specialized/BusinessLogger";

export type { BusinessEvent, BusinessEventType } from "./types/BusinessTypes";

// Services - Phase 4
export {
  LogQueryService,
  logQueryService,
  type LogQueryFilters,
  type LogQueryResult,
  type LogStorageBackend,
} from "./service/LogQueryService";

export {
  RetentionService,
  retentionService,
  type RetentionConfig,
  type RetentionPolicy,
} from "./service/RetentionService";

// Specialized loggers
export { EnhancedAuditLogger, enhancedAuditLogger } from "./specialized/EnhancedAuditLogger";

export type {
  AuditEventMetadata,
  AuditEventType,
  AuditLoggerConfig,
  AuditSeverity,
  EnhancedAuditLogEntry,
} from "./types/AuditTypes";

// Create default logger instance
export { logger, professionalLogger } from "./logger-instance";

/**
 * Default export for convenience
 */
import { logger } from "./logger-instance";
export default logger;
