/**
 * Server-side logging configuration for Next.js API routes
 * Integrates Pino HTTP middleware for request/response logging
 */

import pino from "pino";
import pinoHttp from "pino-http";
import { isProd } from "./config/env";

// Determine environment
const isProduction = isProd;

// Server logger configuration
const loggerConfig: Record<string, unknown> = {
  level: isProduction ? "info" : "debug",
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
    log: (obj: Record<string, unknown>) => {
      if (obj["err"]) {
        return {
          ...obj,
          err: pino.stdSerializers.err(obj["err"] as Error),
        };
      }
      return obj;
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
};

// Add transport only in development
if (!isProduction) {
  loggerConfig["transport"] = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  };
}

const serverLogger = pino(loggerConfig);

// Create HTTP middleware for request logging
export const httpLogger = pinoHttp({
  logger: serverLogger.child({ component: "HTTP" }),
  // Customize request logging
  customLogLevel: (_req, _res, err) => {
    if (err) return "error";
    if (_res.statusCode >= 400 && _res.statusCode < 500) return "warn";
    if (_res.statusCode >= 500) return "error";
    return "info";
  },
  // Customize what gets logged
  customSuccessMessage: (_req, _res) => {
    return `${_req.method} ${_req.url} completed with status ${_res.statusCode}`;
  },
  customErrorMessage: (_req, _res, err) => {
    return `${_req.method} ${_req.url} failed with status ${_res.statusCode}: ${err?.message || "unknown error"}`;
  },
  // Don't log certain paths in production for performance
  autoLogging: !isProduction,
  // Redact sensitive data
  serializers: {
    req: req => ({
      method: req.method,
      url: req.url,
      headers: {
        ...req.headers,
        authorization: req.headers.authorization ? "[REDACTED]" : undefined,
        cookie: req.headers.cookie ? "[REDACTED]" : undefined,
        "x-api-key": req.headers["x-api-key"] ? "[REDACTED]" : undefined,
      },
    }),
    res: _res => pino.stdSerializers.res(_res),
  },
});

// Export the server logger for direct use in API routes
export { serverLogger };

/**
 * Higher-order function to wrap API route handlers with logging
 */
export function withLogging(handler: unknown, context?: string) {
  const routeLogger = serverLogger.child({
    component: context || "API",
    route: "unknown",
  });

  return async (req: unknown, res: unknown) => {
    const start = Date.now();
    const request = req as { method?: string; url?: string; headers?: Record<string, unknown> };
    const response = res as { statusCode?: number };

    try {
      routeLogger.info(
        {
          method: request.method,
          url: request.url,
          userAgent: request.headers?.["user-agent"],
        },
        "Request started"
      );

      const result = await (handler as (req: unknown, res: unknown) => unknown)(req, res);

      routeLogger.info(
        {
          method: request.method,
          url: request.url,
          duration: Date.now() - start,
          statusCode: response.statusCode,
        },
        "Request completed"
      );

      return result;
    } catch (error) {
      routeLogger.error(
        {
          err: error,
          method: request.method,
          url: request.url,
          duration: Date.now() - start,
        },
        "Request failed"
      );

      throw error;
    }
  };
}
