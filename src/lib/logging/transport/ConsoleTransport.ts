/**
 * Console Transport - Enhanced Console Logging
 * Pretty-printed logs for development, JSON for production
 */

export interface ConsoleTransportConfig {
    enabled: boolean;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    pretty?: boolean;
    colors?: boolean;
    timestamps?: boolean;
    includeMetadata?: boolean;
}

const DEFAULT_CONFIG: ConsoleTransportConfig = {
    enabled: true,
    level: 'info',
    pretty: process.env.NODE_ENV !== 'production',
    colors: process.env.NODE_ENV !== 'production',
    timestamps: true,
    includeMetadata: true
};

/**
 * ANSI color codes
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m'
};

/**
 * Log levels priority
 */
const LOG_LEVELS: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60
};

/**
 * Console Transport Class
 */
export class ConsoleTransport {
    private config: ConsoleTransportConfig;

    constructor(config: Partial<ConsoleTransportConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Log message to console
     */
    log(
        level: string,
        message: string,
        metadata?: Record<string, any>,
        error?: Error
    ): void {
        if (!this.config.enabled) {
            return;
        }

        // Check level
        const levelNum = LOG_LEVELS[level.toLowerCase()] || LOG_LEVELS.info;
        const configLevelNum = LOG_LEVELS[this.config.level || 'info'];

        if (levelNum < configLevelNum) {
            return; // Below minimum level
        }

        // Format and output
        if (this.config.pretty) {
            this.logPretty(level, message, metadata, error);
        } else {
            this.logJSON(level, message, metadata, error);
        }
    }

    /**
     * Pretty-print log (development)
     */
    private logPretty(
        level: string,
        message: string,
        metadata?: Record<string, any>,
        error?: Error
    ): void {
        const parts: string[] = [];

        // Timestamp
        if (this.config.timestamps) {
            const timestamp = new Date().toISOString();
            parts.push(this.colorize(COLORS.dim, `[${timestamp}]`));
        }

        // Level
        const levelStr = level.toUpperCase().padEnd(5);
        const coloredLevel = this.colorizeLevel(level, levelStr);
        parts.push(coloredLevel);

        // Correlation ID
        if (metadata?.correlationId) {
            const shortId = metadata.correlationId.substring(0, 8);
            parts.push(this.colorize(COLORS.cyan, `[${shortId}]`));
        }

        // Message
        parts.push(message);

        // Output main line
        const consoleMethod = this.getConsoleMethod(level);
        consoleMethod(parts.join(' '));

        // Metadata
        if (this.config.includeMetadata && metadata && Object.keys(metadata).length > 0) {
            const filteredMetadata = this.filterMetadata(metadata);
            if (Object.keys(filteredMetadata).length > 0) {
                try {
                    consoleMethod(this.colorize(COLORS.dim, JSON.stringify(filteredMetadata, null, 2)));
                } catch (err) {
                    consoleMethod(this.colorize(COLORS.dim, '[Circular or Unserializable Metadata]'));
                }
            }
        }

        // Error
        if (error) {
            consoleMethod(this.colorize(COLORS.red, error.stack || error.message));
        }
    }

    /**
     * JSON log (production)
     */
    private logJSON(
        level: string,
        message: string,
        metadata?: Record<string, any>,
        error?: Error
    ): void {
        const logEntry: Record<string, any> = {
            level,
            message,
            timestamp: new Date().toISOString()
        };

        if (metadata && Object.keys(metadata).length > 0) {
            logEntry.metadata = this.filterMetadata(metadata);
        }

        if (error) {
            logEntry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        }

        const consoleMethod = this.getConsoleMethod(level);
        consoleMethod(JSON.stringify(logEntry));
    }

    /**
     * Filter metadata (remove internal fields)
     */
    private filterMetadata(metadata: Record<string, any>): Record<string, any> {
        const filtered = { ...metadata };

        // Remove internal fields
        delete filtered.correlationId; // Already shown separately
        delete filtered.args;           // Internal
        delete filtered.gameLoop;       // Internal flag

        return filtered;
    }

    /**
     * Get appropriate console method
     */
    private getConsoleMethod(level: string): (...args: any[]) => void {
        switch (level.toLowerCase()) {
            case 'fatal':
            case 'error':
                return console.error;
            case 'warn':
                return console.warn;
            case 'debug':
            case 'trace':
                return console.debug;
            default:
                return console.log;
        }
    }

    /**
     * Colorize text
     */
    private colorize(color: string, text: string): string {
        if (!this.config.colors || typeof process === 'undefined' || !process.stdout?.isTTY) {
            return text;
        }

        return `${color}${text}${COLORS.reset}`;
    }

    /**
     * Colorize level based on severity
     */
    private colorizeLevel(level: string, text: string): string {
        if (!this.config.colors) {
            return `[${text}]`;
        }

        let color: string;
        switch (level.toLowerCase()) {
            case 'trace':
                color = COLORS.dim;
                break;
            case 'debug':
                color = COLORS.cyan;
                break;
            case 'info':
                color = COLORS.green;
                break;
            case 'warn':
                color = COLORS.yellow;
                break;
            case 'error':
                color = COLORS.red;
                break;
            case 'fatal':
                color = COLORS.bgRed + COLORS.white;
                break;
            default:
                color = COLORS.reset;
        }

        return this.colorize(color, `[${text}]`);
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<ConsoleTransportConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default instance
 */
export const consoleTransport = new ConsoleTransport({
    enabled: true,
    level: process.env.LOG_LEVEL as any || 'info',
    pretty: process.env.NODE_ENV !== 'production',
    colors: process.env.NODE_ENV !== 'production',
    timestamps: true,
    includeMetadata: true
});

/**
 * Helper function for quick console logging
 */
export function logToConsole(
    level: string,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
): void {
    consoleTransport.log(level, message, metadata, error);
}
