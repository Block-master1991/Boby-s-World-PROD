/**
 * Examples of how to use the new Pino-based logger system
 * This file demonstrates various logging patterns and best practices
 */

// Import the main logger (legacy interface for backward compatibility)
import { logger, pinoLogger } from './src/utils/logger';

// Server-side usage examples
export function serverLoggingExamples() {
    // Basic logging with legacy Logger class (backward compatible)
    logger.log('Server started successfully');
    logger.warn('This is a warning message');
    logger.error('Database connection failed', new Error('Something went wrong'));

    // Structured logging with Pino logger (new professional interface)
    pinoLogger.info({
        userId: '12345',
        action: 'login',
        ip: '192.168.1.1'
    }, 'User authentication successful');

    // Performance logging
    const start = Date.now();
    // ... some operation
    logger.timing('database_query', Date.now() - start, { query: 'SELECT * FROM users' });

    // Security logging
    logger.security('Failed login attempt', {
        username: 'admin',
        ip: '10.0.0.1',
        userAgent: 'Suspicious User Agent'
    });

    // Audit logging
    logger.audit('user_registration', 'user123', {
        email: 'user@example.com',
        registrationMethod: 'email'
    });
}

// Client-side usage examples (in React components)
export function clientLoggingExamples() {
    // Import client logger utilities
    const { game, perf, errors } = require('./src/lib/client-logger');

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
}

// API Route logging example
export async function apiRouteExample(req: any, res: any) {
    const { serverLogger, withLogging } = require('./src/lib/server-logger');

    // Direct logging in API route
    serverLogger.info({
        method: req.method,
        url: req.url,
        userId: req.user?.id
    }, 'API request received');

    try {
        // Your API logic here
        const result = await processRequest(req);

        serverLogger.info({
            method: req.method,
            url: req.url,
            statusCode: 200,
            responseSize: JSON.stringify(result).length
        }, 'API request completed successfully');

        return result;
    } catch (error) {
        serverLogger.error({
            err: error,
            method: req.method,
            url: req.url
        }, 'API request failed');

        throw error;
    }
}

// Wrapped API route with automatic logging
export const loggedApiRoute = require('./src/lib/server-logger').withLogging(async (req: any, res: any) => {
    // Your handler logic - logging is automatic
    return { success: true };
}, 'UserAPI');

// Legacy compatibility - existing code can gradually migrate
export function legacyUsageExample() {
    // Old style logging with Logger class (still works)
    logger.log('This is a log message', 'extra', 'args');
    logger.debug('Debug information');
    logger.error('Error occurred');

    // New structured logging with Pino
    pinoLogger.info({ userId: '123', action: 'click' }, 'Button clicked');
}

// Best practices (examples - not executable code)
/*
Structured logging examples:

GOOD: Use structured logging instead of string concatenation
logger.info({ userId: '123', action: 'purchase', amount: 100 }, 'Purchase completed');

BAD: String concatenation loses structure
logger.info(`Purchase completed for user ${userId}: $${amount}`);

GOOD: Include relevant context with errors
logger.error({ err: error, userId: '123', operation: 'payment' }, 'Payment processing failed');

BAD: Missing context
logger.error('Payment failed');

Log levels:
- trace: Very detailed debugging (usually disabled)
- debug: Development debugging info
- info: General information
- warn: Warnings that need attention
- error: Errors that need fixing
- fatal: Critical errors that crash the system

Security: Always redact sensitive information
GOOD: logger.info({ userId: '123', action: 'login', ip: '[REDACTED]' }, 'User logged in');
BAD: logger.info({ userId: '123', password: 'secret123', ip: '1.2.3.4' }, 'User logged in');
*/

async function loadAssets() {
    // Mock asset loading
    return new Promise(resolve => setTimeout(resolve, 100));
}

async function processRequest(req: any) {
    // Mock request processing
    return { data: 'processed' };
}
