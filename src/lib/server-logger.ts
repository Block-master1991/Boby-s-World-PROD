/**
 * Server-side logging configuration for Next.js API routes
 * Integrates Pino HTTP middleware for request/response logging
 */

import pino from 'pino';
import pinoHttp from 'pino-http';

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';

// Server logger configuration
const serverLogger = pino({
    level: isProduction ? 'info' : 'debug',
    formatters: {
        level: (label: string) => {
            return { level: label };
        },
        log: (obj: any) => {
            if (obj.err) {
                return {
                    ...obj,
                    err: pino.stdSerializers.err(obj.err)
                };
            }
            return obj;
        }
    },
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
    },
    transport: !isProduction ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    } : undefined
});

// Create HTTP middleware for request logging
export const httpLogger = pinoHttp({
    logger: serverLogger.child({ component: 'HTTP' }),
    // Customize request logging
    customLogLevel: (req, res, err) => {
        if (err) return 'error';
        if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
        if (res.statusCode >= 500) return 'error';
        return 'info';
    },
    // Customize what gets logged
    customSuccessMessage: (req, res) => {
        return `${req.method} ${req.url} completed`;
    },
    customErrorMessage: (req, res, err) => {
        return `${req.method} ${req.url} failed with ${err?.message || 'unknown error'}`;
    },
    // Don't log certain paths in production for performance
    autoLogging: !isProduction,
    // Redact sensitive data
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
                ...req.headers,
                authorization: req.headers.authorization ? '[REDACTED]' : undefined,
                cookie: req.headers.cookie ? '[REDACTED]' : undefined,
                'x-api-key': req.headers['x-api-key'] ? '[REDACTED]' : undefined
            }
        }),
        res: pino.stdSerializers.res
    }
});

// Export the server logger for direct use in API routes
export { serverLogger };

/**
 * Higher-order function to wrap API route handlers with logging
 */
export function withLogging(handler: any, context?: string) {
    const routeLogger = serverLogger.child({
        component: context || 'API',
        route: 'unknown'
    });

    return async (req: any, res: any) => {
        const start = Date.now();

        try {
            routeLogger.info({
                method: req.method,
                url: req.url,
                userAgent: req.headers['user-agent']
            }, 'Request started');

            const result = await handler(req, res);

            routeLogger.info({
                method: req.method,
                url: req.url,
                duration: Date.now() - start,
                statusCode: res.statusCode
            }, 'Request completed');

            return result;
        } catch (error) {
            routeLogger.error({
                err: error,
                method: req.method,
                url: req.url,
                duration: Date.now() - start
            }, 'Request failed');

            throw error;
        }
    };
}
