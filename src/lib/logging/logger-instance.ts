import type { LogContext } from "./core/LogContext";
import { LoggerCore } from "./core/LoggerCore";

/**
 * Default logger instance - backward compatible with existing logger
 */
const getEnv = (key: string): string | undefined => {
  try {
    if (typeof process !== "undefined" && process.env) return process.env[key];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof globalThis !== "undefined" && (globalThis as any).process?.env)
      return (globalThis as any).process.env[key];
  } catch {
    /* ignore */
  }
  return undefined;
};

export const professionalLogger = new LoggerCore({
  name: "BobyWorld",
  version: getEnv("npm_package_version") || "1.0.0",
  piiProtection: getEnv("NODE_ENV") === "production",
  sanitization: true,
  includeContext: true,
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

  error: (
    message: string,
    errorOrMetadata?: Error | string | unknown,
    metadata?: Record<string, unknown>
  ) => professionalLogger.error(message, errorOrMetadata, metadata),

  fatal: (
    message: string,
    errorOrMetadata?: Error | string | unknown,
    metadata?: Record<string, unknown>
  ) => professionalLogger.fatal(message, errorOrMetadata, metadata),

  // Contextual logging
  withContext: (context: Partial<LogContext>) => professionalLogger.withContext(context),

  // Child logger
  child: (bindings: Record<string, unknown>) => professionalLogger.child(bindings),

  // Utility
  flush: () => professionalLogger.flush(),
};
