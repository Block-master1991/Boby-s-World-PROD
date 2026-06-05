import { env, isProd } from "../../config/env";
/**
 * Log Levels with Priority System
 * Higher number = higher priority
 */

export enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
  SILENT = 100,
}

export type LogLevelName = keyof typeof LogLevel;

// Pino-compatible log level names
export type PinoLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Convert LogLevel enum to Pino level name
 */
export function toPinoLevel(level: LogLevel): PinoLogLevel {
  switch (level) {
    case LogLevel.TRACE:
      return "trace";
    case LogLevel.DEBUG:
      return "debug";
    case LogLevel.INFO:
      return "info";
    case LogLevel.WARN:
      return "warn";
    case LogLevel.ERROR:
      return "error";
    case LogLevel.FATAL:
      return "fatal";
    default:
      return "info";
  }
}

/**
 * Convert Pino level name to LogLevel enum
 */
export function fromPinoLevel(level: PinoLogLevel): LogLevel {
  switch (level) {
    case "trace":
      return LogLevel.TRACE;
    case "debug":
      return LogLevel.DEBUG;
    case "info":
      return LogLevel.INFO;
    case "warn":
      return LogLevel.WARN;
    case "error":
      return LogLevel.ERROR;
    case "fatal":
      return LogLevel.FATAL;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Check if a level should be logged based on configured minimum level
 */
export function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
  return messageLevel >= configuredLevel;
}

/**
 * Get log level from environment or default
 */
export function getLogLevelFromEnv(): LogLevel {
  const envLevel = env.LOG_LEVEL.toUpperCase();

  if (envLevel && envLevel in LogLevel) {
    return LogLevel[envLevel as LogLevelName];
  }

  // Default: info in production, debug in development
  return isProd ? LogLevel.INFO : LogLevel.DEBUG;
}
