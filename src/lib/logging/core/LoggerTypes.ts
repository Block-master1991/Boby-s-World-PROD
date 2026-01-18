import type { LogLevel } from './LogLevel';

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

export interface ILoggerCore {
    trace(message: string, metadata?: Record<string, unknown>): void;
    debug(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void;
    fatal(message: string, errorOrMetadata?: Error | string | unknown, metadata?: Record<string, unknown>): void;
}
