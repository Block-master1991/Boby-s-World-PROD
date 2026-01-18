/**
 * PII (Personally Identifiable Information) Redactor
 * Automatically detects and redacts sensitive personal data
 */

export interface PIIRedactionConfig {
    enabled: boolean;
    strictMode?: boolean;
    allowedFields?: string[];
    customPatterns?: Array<{
        name: string;
        pattern: RegExp;
        replacement: string;
    }>;
}

const DEFAULT_CONFIG: PIIRedactionConfig = {
    enabled: true,
    strictMode: false,
    allowedFields: []
};

/**
 * Built-in PII patterns
 */
const PII_PATTERNS = {
    // Email addresses
    email: {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '***@***.***'
    },

    // IP addresses (IPv4)
    ipv4: {
        pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        replacement: (match: string) => {
            const parts = match.split('.');
            return `${parts[0]}.***.***.***`;
        }
    },

    // Credit card numbers
    creditCard: {
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        replacement: (match: string) => {
            const last4 = match.slice(-4);
            return `****-****-****-${last4}`;
        }
    },

    // Social Security Numbers (US format)
    ssn: {
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        replacement: '***-**-****'
    },

    // Phone numbers (various formats)
    phone: {
        pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        replacement: '***-***-****'
    },

    // API keys and tokens (common patterns)
    apiKey: {
        pattern: /\b(?:api[_-]?key|token|secret|password|passwd|pwd)["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})/gi,
        replacement: (match: string) => {
            return match.replace(/([A-Za-z0-9_-]{16,})/g, '[REDACTED]');
        }
    },

    // JWT tokens
    jwt: {
        pattern: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
        replacement: '[REDACTED_JWT]'
    },

    // OAuth tokens
    bearerToken: {
        pattern: /\b(?:Bearer|bearer)\s+([A-Za-z0-9_.-]+)/g,
        replacement: 'Bearer [REDACTED]'
    }
};

/**
 * Sensitive field names to redact
 */
const SENSITIVE_FIELD_NAMES = new Set([
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'apikey',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'privateKey',
    'private_key',
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'ssn',
    'socialSecurity',
    'social_security',
    'dob',
    'dateOfBirth',
    'date_of_birth'
]);

/**
 * PII Redactor Class
 */
export class PIIRedactor {
    private config: PIIRedactionConfig;

    constructor(config: Partial<PIIRedactionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Redact PII from any data structure
     */
    redact<T>(data: T): T {
        if (!this.config.enabled) {
            return data;
        }

        return this.redactValue(data) as T;
    }

    /**
     * Recursively redact values
     */
    private redactValue(value: unknown, fieldName?: string): unknown {
        // Null or undefined
        if (value === null || value === undefined) {
            return value;
        }

        // Check if field name is in allowed list
        if (fieldName && this.config.allowedFields?.includes(fieldName)) {
            return value;
        }

        // Check if field name is sensitive
        if (fieldName && this.isSensitiveFieldName(fieldName)) {
            return '[REDACTED]';
        }

        // String - apply pattern matching
        if (typeof value === 'string') {
            return this.redactString(value);
        }

        // Array - redact each element
        if (Array.isArray(value)) {
            return value.map((item, index) =>
                this.redactValue(item, `${fieldName}[${index}]`)
            );
        }

        // Object - redact each property
        if (typeof value === 'object') {
            const redacted: Record<string, unknown> = {};

            for (const [key, val] of Object.entries(value)) {
                // Skip functions
                if (typeof val === 'function') {
                    continue;
                }

                redacted[key] = this.redactValue(val, key);
            }

            return redacted;
        }

        // Primitive types (number, boolean, etc.)
        return value;
    }

    /**
     * Redact PII patterns from strings
     */
    private redactString(str: string): string {
        let result = str;

        // Apply built-in patterns
        for (const [, config] of Object.entries(PII_PATTERNS)) {
            if (typeof config.replacement === 'function') {
                result = result.replace(config.pattern, config.replacement);
            } else {
                result = result.replace(config.pattern, config.replacement);
            }
        }

        // Apply custom patterns
        if (this.config.customPatterns) {
            for (const custom of this.config.customPatterns) {
                result = result.replace(custom.pattern, custom.replacement);
            }
        }

        return result;
    }

    /**
     * Check if field name is sensitive
     */
    private isSensitiveFieldName(fieldName: string): boolean {
        const normalized = fieldName.toLowerCase();

        // Exact match
        if (SENSITIVE_FIELD_NAMES.has(normalized)) {
            return true;
        }

        // Partial match in strict mode
        if (this.config.strictMode) {
            return Array.from(SENSITIVE_FIELD_NAMES).some(sensitive => 
                normalized.includes(sensitive)
            );
        }

        return false;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<PIIRedactionConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Add custom redaction pattern
     */
    addPattern(name: string, pattern: RegExp, replacement: string): void {
        if (!this.config.customPatterns) {
            this.config.customPatterns = [];
        }

        this.config.customPatterns.push({ name, pattern, replacement });
    }

    /**
     * Allow specific field to bypass redaction
     */
    allowField(fieldName: string): void {
        if (!this.config.allowedFields) {
            this.config.allowedFields = [];
        }

        if (!this.config.allowedFields.includes(fieldName)) {
            this.config.allowedFields.push(fieldName);
        }
    }
}

/**
 * Default instance
 */
export const defaultPIIRedactor = new PIIRedactor({
    enabled: process.env.NODE_ENV === 'production',
    strictMode: true
});

/**
 * Helper function for quick redaction
 */
export function redactPII<T>(data: T, config?: Partial<PIIRedactionConfig>): T {
    const redactor = config ? new PIIRedactor(config) : defaultPIIRedactor;
    return redactor.redact(data);
}
