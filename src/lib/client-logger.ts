/**
 * Client-side logging utilities for browser environment
 * Safe logging that doesn't expose sensitive data in production
 */

import { pinoLogger } from "../utils/logger";

// Client-specific logger instance
export const clientLogger = pinoLogger.child({ component: "Client" });

export interface LogMetadata {
  [key: string]: unknown;
}

// Performance monitoring
export const performanceLogger = {
  /**
   * Log performance metrics
   */
  logMetric(name: string, value: number, metadata?: LogMetadata) {
    clientLogger.info(
      {
        performance: { name, value },
        ...metadata,
      },
      `Performance: ${name}`
    );
  },

  /**
   * Time a function execution
   */
  async timeFunction<T>(label: string, fn: () => Promise<T>, metadata?: LogMetadata): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.logMetric(label, duration, { success: true, ...metadata });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      clientLogger.error(
        {
          err: error,
          performance: { label, duration },
          ...metadata,
        },
        `Performance: ${label} failed`
      );
      throw error;
    }
  },

  /**
   * Measure Web Vitals
   */
  logWebVital(metric: string, value: number) {
    clientLogger.info(
      {
        webVital: { metric, value },
      },
      `Web Vital: ${metric}`
    );
  },
};

// Error boundary logging
export const errorLogger = {
  /**
   * Log React error boundaries
   */
  logBoundaryError(error: Error, errorInfo: unknown, componentName?: string) {
    clientLogger.error(
      {
        err: error,
        errorInfo,
        component: componentName,
        boundary: true,
      },
      `React Error Boundary: ${componentName || "Unknown component"}`
    );
  },

  /**
   * Log unhandled promise rejections
   */
  logUnhandledRejection(reason: unknown, promise: Promise<unknown>) {
    clientLogger.error(
      {
        reason,
        promise: promise.toString(),
        unhandled: true,
      },
      "Unhandled Promise Rejection"
    );
  },

  /**
   * Log global JavaScript errors
   */
  logGlobalError(details: {
    message: string;
    source?: string;
    lineno?: number;
    colno?: number;
    error?: Error;
  }) {
    const { message, source, lineno, colno, error } = details;
    clientLogger.error(
      {
        err: error,
        source,
        lineno,
        colno,
        global: true,
      },
      `Global Error: ${message}`
    );
  },
};

// User interaction logging (be careful with PII)
export const interactionLogger = {
  /**
   * Log user interactions (without sensitive data)
   */
  async logInteraction(action: string, element?: string, metadata?: LogMetadata) {
    // Only log in development or for specific actions
    const { isDev } = await import("@/lib/config/env");
    if (isDev || action.includes("error") || action.includes("fail")) {
      clientLogger.debug(
        {
          interaction: { action, element },
          ...metadata,
        },
        `User Interaction: ${action}`
      );
    }
  },
};

// Game-specific logging
export const gameLogger = {
  /**
   * Log game events
   */
  logGameEvent(event: string, data?: LogMetadata) {
    clientLogger.debug(
      {
        gameEvent: event,
        data,
      },
      `Game Event: ${event}`
    );
  },

  /**
   * Log game performance metrics
   */
  logGamePerformance(metric: string, value: number) {
    performanceLogger.logMetric(`game.${metric}`, value);
  },

  /**
   * Log game errors specifically
   */
  logGameError(error: Error, context?: LogMetadata) {
    clientLogger.error(
      {
        err: error,
        gameError: true,
        context,
      },
      `Game Error: ${error.message}`
    );
  },
};

// Export all loggers
export {
  clientLogger as default,
  errorLogger as errors,
  gameLogger as game,
  interactionLogger as interactions,
  performanceLogger as perf,
};
