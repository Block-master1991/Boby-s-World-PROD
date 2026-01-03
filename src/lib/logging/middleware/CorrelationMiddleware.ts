/**
 * Correlation Middleware
 * Automatically manages correlation IDs for request tracking
 */

import { contextManager, type LogContext } from '../core/LogContext';

export interface CorrelationConfig {
    enabled: boolean;
    headerName?: string;
    generateIfMissing?: boolean;
    propagateToResponse?: boolean;
}

const DEFAULT_CONFIG: CorrelationConfig = {
    enabled: true,
    headerName: 'x-correlation-id',
    generateIfMissing: true,
    propagateToResponse: true
};

/**
 * Correlation Middleware Class
 */
export class CorrelationMiddleware {
    private config: CorrelationConfig;

    constructor(config: Partial<CorrelationConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Extract or generate correlation ID from request
     */
    extractCorrelationId(headers: Headers | Record<string, string>): string | undefined {
        if (!this.config.enabled) {
            return undefined;
        }

        const getHeader = (key: string): string | null => {
            if (headers instanceof Headers) {
                return headers.get(key);
            }
            return headers[key] || headers[key.toLowerCase()] || null;
        };

        // Try to get from configured header
        let correlationId = getHeader(this.config.headerName!);

        // Fallback headers
        if (!correlationId) {
            correlationId = getHeader('x-request-id') ||
                getHeader('request-id') ||
                getHeader('x-trace-id');
        }

        // Generate if missing and configured to do so
        if (!correlationId && this.config.generateIfMissing) {
            correlationId = this.generateCorrelationId();
        }

        return correlationId || undefined;
    }

    /**
     * Create context from request headers
     */
    createContextFromRequest(
        headers: Headers | Record<string, string>,
        additionalContext?: Partial<LogContext>
    ): LogContext {
        const extractedContext = contextManager.extractFromHeaders(headers);
        const correlationId = this.extractCorrelationId(headers);

        return contextManager.createContext({
            ...extractedContext,
            correlationId: correlationId || extractedContext.correlationId,
            ...additionalContext
        });
    }

    /**
     * Middleware for Next.js API routes
     */
    async handleRequest<T>(
        request: Request,
        handler: (context: LogContext) => Promise<T>,
        additionalContext?: Partial<LogContext>
    ): Promise<{ result: T; context: LogContext }> {
        const context = this.createContextFromRequest(request.headers, additionalContext);

        const result = await contextManager.runWithContext(context, async () => {
            return await handler(context);
        });

        return { result, context };
    }

    /**
     * Add correlation headers to response
     */
    addCorrelationHeaders(
        headers: Headers,
        context?: LogContext
    ): void {
        if (!this.config.propagateToResponse) {
            return;
        }

        const ctx = context || contextManager.getCurrentContext();
        if (!ctx) {
            return;
        }

        if (ctx.correlationId) {
            headers.set(this.config.headerName!, ctx.correlationId);
            headers.set('x-request-id', ctx.correlationId);
        }

        if (ctx.traceId) {
            headers.set('x-trace-id', ctx.traceId);
        }
    }

    /**
     * Generate a unique correlation ID
     */
    private generateCorrelationId(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }

        // Fallback: timestamp + random
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<CorrelationConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default instance
 */
export const correlationMiddleware = new CorrelationMiddleware();

/**
 * Helper: Wrap Next.js API route with correlation
 */
export function withCorrelation<T = any>(
    handler: (request: Request, context: LogContext) => Promise<T>
) {
    return async (request: Request): Promise<Response> => {
        const { result, context } = await correlationMiddleware.handleRequest(
            request,
            async (ctx) => await handler(request, ctx)
        );

        // If result is already a Response, add headers
        if (result instanceof Response) {
            correlationMiddleware.addCorrelationHeaders(result.headers, context);
            return result;
        }

        // Otherwise, create response with correlation headers
        const response = Response.json(result);
        correlationMiddleware.addCorrelationHeaders(response.headers, context);
        return response;
    };
}

/**
 * Helper: Get current correlation ID
 */
export function getCurrentCorrelationId(): string | undefined {
    return contextManager.getCurrentContext()?.correlationId;
}
