import type { LogContext } from "./LogContext";
import { contextManager } from "./LogContext";
import type { ILoggerCore } from "./LoggerTypes";

/**
 * Contextual Logger - Logger bound to specific context
 */
export class ContextualLogger {
  constructor(
    private core: ILoggerCore,
    private context: Partial<LogContext>
  ) {}

  run<T>(fn: () => T | Promise<T>): T | Promise<T> {
    const fullContext = contextManager.createContext(this.context);
    return contextManager.runWithContext(fullContext, fn);
  }

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.run(() => this.core.trace(message, metadata));
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.run(() => this.core.debug(message, metadata));
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.run(() => this.core.info(message, metadata));
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.run(() => this.core.warn(message, metadata));
  }

  error(
    message: string,
    errorOrMetadata?: Error | string | unknown,
    metadata?: Record<string, unknown>
  ): void {
    this.run(() => this.core.error(message, errorOrMetadata, metadata));
  }

  fatal(
    message: string,
    errorOrMetadata?: Error | string | unknown,
    metadata?: Record<string, unknown>
  ): void {
    this.run(() => this.core.fatal(message, errorOrMetadata, metadata));
  }
}
