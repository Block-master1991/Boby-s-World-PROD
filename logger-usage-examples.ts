/**
 * Examples of how to use the new Pino-based logger system
 * This file demonstrates various logging patterns and best practices
 */

import { serverLogger, withLogging } from "./src/lib/server-logger";
import { logger, pinoLogger } from "./src/utils/logger";

// Server-side usage examples
export function serverLoggingExamples() {
  // Basic logging with legacy Logger class (backward compatible)
  logger.log("Server started successfully");
  logger.warn("This is a warning message");
  logger.error("Database connection failed", new Error("Something went wrong"));

  // Structured logging with Pino logger (new professional interface)
  pinoLogger.info(
    {
      userId: "12345",
      action: "login",
      ip: "192.168.1.1",
    },
    "User authentication successful"
  );

  // Performance logging
  const start = Date.now();
  // ... some operation
  logger.timing("database_query", Date.now() - start, { query: "SELECT * FROM users" });

  // Security logging
  logger.security("Failed login attempt", {
    username: "admin",
    ip: "10.0.0.1",
    userAgent: "Suspicious User Agent",
  });

  // Audit logging
  logger.audit("user_registration", "user123", {
    email: "user@example.com",
    registrationMethod: "email",
  });
}

// Client-side usage examples
// Note: Actual imports would depend on client-side modules which might not be available in this server context
export function clientLoggingExamples() {
  /* 
    import { game, perf, errors } from './src/lib/client-logger';

    // Game event logging
    game.logGameEvent('level_completed', { level: 5, score: 1000 });

    // Performance monitoring
    perf.logMetric('render_time', 16.5, { component: 'GameCanvas' });

    // Time function execution
    perf.timeFunction('asset_loading', async () => {
        // Load game assets
        await loadAssets();
    });

    // Error boundary logging
    errors.logBoundaryError(new Error('Component crashed'), {
        componentStack: 'GameUI -> PlayerStats -> ...'
    }, 'GameUI');

    // Global error logging
    errors.logGlobalError('ReferenceError: variable is not defined', 'game.js', 42, 15);
    */
}

// API Route logging example
export async function apiRouteExample(req: { method: string; url: string; user?: { id: string } }) {
  // Direct logging in API route
  serverLogger.info(
    {
      method: req.method,
      url: req.url,
      userId: req.user?.id,
    },
    "API request received"
  );

  try {
    // Your API logic here
    const result = await processRequest();

    serverLogger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: 200,
        responseSize: JSON.stringify(result).length,
      },
      "API request completed successfully"
    );

    return result;
  } catch (error) {
    serverLogger.error(
      {
        err: error,
        method: req.method,
        url: req.url,
      },
      "API request failed"
    );

    throw error;
  }
}

// Wrapped API route with automatic logging
export const loggedApiRoute = withLogging(async () => {
  // Your handler logic - logging is automatic
  await Promise.resolve(); // Satisfy require-await
  return { success: true };
}, "UserAPI");

// ... (Legacy code remains unchanged)

async function processRequest() {
  // Mock request processing
  await Promise.resolve(); // Satisfy require-await
  return { data: "processed" };
}
