/**
 * Log Context - Request Correlation and Context Management
 * Provides correlation IDs and context propagation across async operations
 */

// Safe imports
const randomUUID = 
    (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) 
        ? globalThis.crypto.randomUUID.bind(globalThis.crypto) 
        : () => `uuid-${Math.random().toString(36).substring(2, 11)}`;

// Safe AsyncLocalStorage import for both Node.js and Browser environments
interface AsyncLocalStorageLike<T> {
    run<R>(store: T, callback: () => R | Promise<R>): R | Promise<R>;
    getStore(): T | undefined;
    snapshot?(): AsyncLocalStorageLike<T>;
}

// Initialize AsyncLocalStorage
let AsyncLocalStorageConstructor: new <T>() => AsyncLocalStorageLike<T>;

try {
    const isNode = typeof process !== 'undefined' && !!process.versions?.node;
    if (isNode) {
        // Use Node.js built-in AsyncLocalStorage
        // We use a dynamic lookup to avoid static analysis triggers for 'require'
        // while ensuring AsyncLocalStorage is functional on the server.
        const req = (globalThis as unknown as { require?: (id: string) => { AsyncLocalStorage: typeof AsyncLocalStorageConstructor } }).require;
        if (typeof req === 'function') {
            const nodeHooks = req('async_hooks');
            AsyncLocalStorageConstructor = nodeHooks.AsyncLocalStorage;
        } else {
            throw new Error('Node.js require is not available in this environment');
        }
    } else {
        throw new Error('Not in Node.js environment');
    }
} catch {
    // Fallback for Browser or environments without AsyncLocalStorage
    AsyncLocalStorageConstructor = class MockAsyncLocalStorage<T> implements AsyncLocalStorageLike<T> {
        private store: T | undefined;

        run<R>(store: T, callback: () => R | Promise<R>): R | Promise<R> {
            // Check if callback returns a promise
            // Note: This basic mock doesn't handle async context propagation properly in browser
            // but prevents crashes. In browser, correlation ID is usually explicitly passed or single-use.
            this.store = store;
            try {
                return callback();
            } finally {
                this.store = undefined;
            }
        }

        getStore(): T | undefined {
            return this.store;
        }

        snapshot?(): AsyncLocalStorageLike<T> {
            return new MockAsyncLocalStorage<T>();
        }
    };
}

export interface LogContext {
    correlationId: string;
    userId?: string;
    sessionId?: string;
    requestId?: string;
    traceId?: string;
    spanId?: string;
    [key: string]: unknown;
}

/**
 * Async Local Storage for context propagation
 * Works across async boundaries automatically
 */
const asyncLocalStorage = new AsyncLocalStorageConstructor<LogContext>();

/**
 * Context Manager for logging
 */
export class ContextManager {
    private static instance: ContextManager;

    private constructor() { }

    public static getInstance(): ContextManager {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager();
        }
        return ContextManager.instance;
    }

    /**
     * Create a new context with auto-generated correlation ID
     */
    createContext(initialContext: Partial<LogContext> = {}): LogContext {
        return {
            correlationId: initialContext.correlationId || this.generateCorrelationId(),
            ...initialContext
        };
    }

    /**
     * Run code within a specific context
     */
    runWithContext<T>(context: LogContext, fn: () => T | Promise<T>): T | Promise<T> {
        return asyncLocalStorage.run(context, fn);
    }

    /**
     * Get the current context (if any)
     */
    getCurrentContext(): LogContext | undefined {
        return asyncLocalStorage.getStore();
    }

    /**
     * Merge additional data into current context
     */
    enrichContext(additionalContext: Partial<LogContext>): void {
        const current = this.getCurrentContext();
        if (current) {
            Object.assign(current, additionalContext);
        }
    }

    /**
     * Generate a unique correlation ID
     */
    private generateCorrelationId(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for environments without crypto.randomUUID
        return randomUUID();
    }

    /**
     * Extract context from HTTP headers
     */
    extractFromHeaders(headers: Headers | Record<string, string>): Partial<LogContext> {
        const context: Partial<LogContext> = {};

        const getHeader = (key: string): string | null => {
            if (headers instanceof Headers) {
                return headers.get(key);
            }
            return headers[key] || headers[key.toLowerCase()] || null;
        };

        // Standard correlation headers
        const correlationId = getHeader('x-correlation-id') ||
            getHeader('x-request-id') ||
            getHeader('request-id');
        if (correlationId) {
            context.correlationId = correlationId;
            context.requestId = correlationId;
        }

        // Trace context (OpenTelemetry compatible)
        const traceId = getHeader('x-trace-id') || getHeader('traceparent');
        if (traceId) {
            context.traceId = traceId;
        }

        const spanId = getHeader('x-span-id');
        if (spanId) {
            context.spanId = spanId;
        }

        // User context
        const userId = getHeader('x-user-id');
        if (userId) {
            context.userId = userId;
        }

        const sessionId = getHeader('x-session-id');
        if (sessionId) {
            context.sessionId = sessionId;
        }

        return context;
    }

    /**
     * Create headers for outgoing requests to propagate context
     */
    toHeaders(context?: LogContext): Record<string, string> {
        const ctx = context || this.getCurrentContext();
        if (!ctx) {
            return {};
        }

        const headers: Record<string, string> = {};

        if (ctx.correlationId) {
            headers['x-correlation-id'] = ctx.correlationId;
            headers['x-request-id'] = ctx.correlationId;
        }

        if (ctx.traceId) {
            headers['x-trace-id'] = ctx.traceId;
        }

        if (ctx.spanId) {
            headers['x-span-id'] = ctx.spanId;
        }

        return headers;
    }
}

/**
 * Singleton instance
 */
export const contextManager = ContextManager.getInstance();

/**
 * Helper: Create and run with new context
 */
export function withContext<T>(
    context: Partial<LogContext>,
    fn: () => T | Promise<T>
): T | Promise<T> {
    const fullContext = contextManager.createContext(context);
    return contextManager.runWithContext(fullContext, fn);
}

/**
 * Helper: Get current correlation ID
 */
export function getCorrelationId(): string | undefined {
    return contextManager.getCurrentContext()?.correlationId;
}
