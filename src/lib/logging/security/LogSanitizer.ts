/**
 * Log Sanitizer - Security Input Sanitization
 * Prevents XSS, SQL Injection, and other injection attacks in logs
 */

export interface SanitizerConfig {
    enabled: boolean;
    removeHTML?: boolean;
    removeScripts?: boolean;
    removeSQLPatterns?: boolean;
    maxLength?: number;
    allowedTags?: string[];
}

const DEFAULT_CONFIG: SanitizerConfig = {
    enabled: true,
    removeHTML: true,
    removeScripts: true,
    removeSQLPatterns: true,
    maxLength: 50000,
    allowedTags: []
};

/**
 * Dangerous patterns to remove/escape
 */
const DANGEROUS_PATTERNS = {
    // Script tags and event handlers
    scripts: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /on\w+\s*=\s*["'][^"']*["']/gi,
        /javascript:/gi
    ],

    // SQL injection patterns
    sql: [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
        /(--|;|\/\*|\*\/)/g,
        /(\bOR\b|\bAND\b)\s+[\w\d]+\s*=\s*[\w\d]+/gi
    ],

    // Command injection
    commands: [
        /(\||&|;|\$\(|`)/g,
        /\b(rm|mv|cp|cat|chmod|chown|kill)\b/gi
    ],

    // Path traversal
    pathTraversal: [
        /\.\.[/\\]/g,
        /\/etc\/passwd/gi,
        /\/proc\//gi
    ],

    // LDAP injection
    ldap: [
        // eslint-disable-next-line no-control-regex
        /[*()\\\u0000]/g
    ]
};

/**
 * Log Sanitizer Class
 */
export class LogSanitizer {
    private config: SanitizerConfig;

    constructor(config: Partial<SanitizerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Sanitize any value before logging
     */
    sanitize<T>(value: T): T {
        if (!this.config.enabled) {
            return value;
        }

        return this.sanitizeValue(value) as T;
    }

    /**
     * Recursively sanitize values
     */
    private sanitizeValue(value: unknown): unknown {
        // Null or undefined
        if (value == null) {
            return value;
        }

        // String - apply sanitization
        if (typeof value === 'string') {
            return this.sanitizeString(value);
        }

        // Number - check for suspicious values
        if (typeof value === 'number') {
            // Prevent extremely large numbers that could cause issues
            if (!Number.isFinite(value)) {
                return '[INFINITE_NUMBER]';
            }
            return value;
        }

        // Boolean
        if (typeof value === 'boolean') {
            return value;
        }

        // Array - sanitize each element
        if (Array.isArray(value)) {
            return value.map(item => this.sanitizeValue(item));
        }

        // Error objects - safely serialize
        if (value instanceof Error) {
            return {
                name: this.sanitizeString(value.name),
                message: this.sanitizeString(value.message),
                stack: value.stack ? this.sanitizeString(value.stack) : undefined
            };
        }

        // Object - sanitize each property
        if (typeof value === 'object') {
            const sanitized: Record<string, unknown> = {};

            for (const [key, val] of Object.entries(value)) {
                // Skip functions and symbols
                if (typeof val === 'function' || typeof val === 'symbol') {
                    continue;
                }

                // Sanitize key name
                const sanitizedKey = this.sanitizeString(key);

                // Recursively sanitize value
                sanitized[sanitizedKey] = this.sanitizeValue(val);
            }

            return sanitized;
        }

        // Other types - convert to string and sanitize
        try {
            return this.sanitizeString(String(value));
        } catch {
            return '[UNSERIALIZABLE]';
        }
    }

    /**
     * Sanitize a string value
     */
    private sanitizeString(str: string): string {
        let result = str;

        // Truncate if too long
        if (this.config.maxLength && result.length > this.config.maxLength) {
            result = result.substring(0, this.config.maxLength) + '...[TRUNCATED]';
        }

        // Remove null bytes
        result = result.replace(/\u0000/g, ''); // eslint-disable-line no-control-regex

        // Remove control characters (except newlines and tabs)
        // eslint-disable-next-line no-control-regex
        result = result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

        // Remove/escape HTML if configured
        if (this.config.removeHTML) {
            result = this.removeHTML(result);
        }

        // Remove scripts if configured
        if (this.config.removeScripts) {
            result = this.removeScripts(result);
        }

        // Remove SQL patterns if configured
        if (this.config.removeSQLPatterns) {
            result = this.removeSQLPatterns(result);
        }

        // Remove command injection attempts
        result = this.removeCommandInjection(result);

        // Remove path traversal attempts
        result = this.removePathTraversal(result);

        return result;
    }

    /**
     * Remove HTML tags (except allowed ones)
     */
    private removeHTML(str: string): string {
        if (!this.config.allowedTags || this.config.allowedTags.length === 0) {
            // Remove all HTML tags
            return str.replace(/<[^>]*>/g, '');
        }

        // Remove only non-allowed tags
        const allowedPattern = this.config.allowedTags.join('|');
        const regex = new RegExp(`<(?!(?:/)?(${allowedPattern})\\b)[^>]*>`, 'gi');
        return str.replace(regex, '');
    }

    /**
     * Remove script tags and event handlers
     */
    private removeScripts(str: string): string {
        let result = str;

        for (const pattern of DANGEROUS_PATTERNS.scripts) {
            result = result.replace(pattern, '[SCRIPT_REMOVED]');
        }

        return result;
    }

    /**
     * Remove SQL injection patterns
     */
    private removeSQLPatterns(str: string): string {
        let result = str;

        // Only remove if it looks like SQL injection attempt
        // (to avoid false positives in legitimate logs)
        const hasSuspiciousSQL = DANGEROUS_PATTERNS.sql.some(pattern =>
            pattern.test(str)
        );

        if (hasSuspiciousSQL) {
            for (const pattern of DANGEROUS_PATTERNS.sql) {
                result = result.replace(pattern, '[SQL_REMOVED]');
            }
        }

        return result;
    }

    /**
     * Remove command injection attempts
     */
    private removeCommandInjection(str: string): string {
        let result = str;

        // Check for command injection patterns
        const hasCommandInjection = DANGEROUS_PATTERNS.commands.some(pattern =>
            pattern.test(str)
        );

        if (hasCommandInjection) {
            for (const pattern of DANGEROUS_PATTERNS.commands) {
                result = result.replace(pattern, '[CMD_REMOVED]');
            }
        }

        return result;
    }

    /**
     * Remove path traversal attempts
     */
    private removePathTraversal(str: string): string {
        let result = str;

        for (const pattern of DANGEROUS_PATTERNS.pathTraversal) {
            result = result.replace(pattern, '[PATH_REMOVED]');
        }

        return result;
    }

    /**
     * Escape HTML entities
     */
    private escapeHTML(str: string): string {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };

        return str.replace(/[&<>"'/]/g, char => map[char]);
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<SanitizerConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default instance
 */
export const defaultSanitizer = new LogSanitizer({
    enabled: true,
    removeHTML: true,
    removeScripts: true,
    removeSQLPatterns: true,
    maxLength: 50000
});

/**
 * Helper function for quick sanitization
 */
export function sanitizeLog<T>(data: T, config?: Partial<SanitizerConfig>): T {
    const sanitizer = config ? new LogSanitizer(config) : defaultSanitizer;
    return sanitizer.sanitize(data);
}
