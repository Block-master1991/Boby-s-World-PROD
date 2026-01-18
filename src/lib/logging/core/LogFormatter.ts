/**
 * Log Formatter
 * Formats log entries for different outputs
 */

import type { LogContext } from './LogContext';
import type { LogLevel } from './LogLevel';

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    context?: LogContext;
    metadata?: Record<string, unknown>;
    error?: Error;
}

export interface FormatterConfig {
    includeTimestamp?: boolean;
    includeLevel?: boolean;
    includeContext?: boolean;
    timestampFormat?: 'iso' | 'unix' | 'relative';
    pretty?: boolean;
    colors?: boolean;
}

const DEFAULT_CONFIG: FormatterConfig = {
    includeTimestamp: true,
    includeLevel: true,
    includeContext: true,
    timestampFormat: 'iso',
    pretty: false,
    colors: false
};

/**
 * ANSI color codes
 */
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m'
};

/**
 * Log Formatter Class
 */
export class LogFormatter {
    private config: FormatterConfig;

    constructor(config: Partial<FormatterConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Format log entry to string
     */
    format(entry: LogEntry): string {
        if (this.config.pretty) {
            return this.formatPretty(entry);
        }

        return this.formatJSON(entry);
    }

    /**
     * Format as JSON (production)
     */
    private formatJSON(entry: LogEntry): string {
        const output: Record<string, unknown> = {};

        if (this.config.includeTimestamp) {
            output['timestamp'] = this.formatTimestamp(entry.timestamp);
        }

        if (this.config.includeLevel) {
            output['level'] = this.getLevelName(entry.level);
        }

        output['message'] = entry.message;

        if (this.config.includeContext && entry.context) {
            output['correlationId'] = entry.context.correlationId;

            if (entry.context.userId) {
                output['userId'] = entry.context.userId;
            }

            if (entry.context.sessionId) {
                output['sessionId'] = entry.context.sessionId;
            }

            if (entry.context.traceId) {
                output['traceId'] = entry.context.traceId;
            }
        }

        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            output['metadata'] = entry.metadata;
        }

        if (entry.error) {
            output['error'] = {
                name: entry.error.name,
                message: entry.error.message,
                stack: entry.error.stack
            };
        }

        return JSON.stringify(output);
    }

    /**
     * Format as pretty text (development)
     */
    private formatPretty(entry: LogEntry): string {
        const parts: string[] = [];

        // Timestamp
        if (this.config.includeTimestamp) {
            const timestamp = this.formatTimestamp(entry.timestamp);
            parts.push(this.colorize(COLORS.dim, `[${timestamp}]`));
        }

        // Level with color
        if (this.config.includeLevel) {
            const levelName = this.getLevelName(entry.level).toUpperCase();
            const coloredLevel = this.colorizeLevel(entry.level, levelName);
            parts.push(coloredLevel);
        }

        // Correlation ID
        if (this.config.includeContext && entry.context?.correlationId) {
            const shortId = entry.context.correlationId.substring(0, 8);
            parts.push(this.colorize(COLORS.cyan, `[${shortId}]`));
        }

        // Message
        parts.push(entry.message);

        // Metadata
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            const metadataStr = JSON.stringify(entry.metadata, null, 2);
            parts.push(`\n${this.colorize(COLORS.dim, metadataStr)}`);
        }

        // Error
        if (entry.error) {
            parts.push(`\n${this.colorize(COLORS.red, entry.error.stack || entry.error.message)}`);
        }

        return parts.join(' ');
    }

    /**
     * Format timestamp
     */
    private formatTimestamp(timestamp: number): string {
        switch (this.config.timestampFormat) {
            case 'unix':
                return String(timestamp);

            case 'relative':{
                const diff = Date.now() - timestamp;
                if (diff < 1000) return `${diff}ms ago`;
                if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
                if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                return `${Math.floor(diff / 3600000)}h ago`;
            }
            case 'iso':
            default:
                return new Date(timestamp).toISOString();
        }
    }

    /**
     * Get level name from enum
     */
    private getLevelName(level: LogLevel): string {
        switch (level) {
            case 10: return 'trace';
            case 20: return 'debug';
            case 30: return 'info';
            case 40: return 'warn';
            case 50: return 'error';
            case 60: return 'fatal';
            default: return 'unknown';
        }
    }

    /**
     * Colorize level based on severity
     */
    private colorizeLevel(level: LogLevel, text: string): string {
        if (!this.config.colors) {
            return `[${text}]`;
        }

        let color: string;
        switch (level) {
            case 10: // TRACE
                color = COLORS.dim;
                break;
            case 20: // DEBUG
                color = COLORS.cyan;
                break;
            case 30: // INFO
                color = COLORS.green;
                break;
            case 40: // WARN
                color = COLORS.yellow;
                break;
            case 50: // ERROR
                color = COLORS.red;
                break;
            case 60: // FATAL
                color = COLORS.bgRed + COLORS.white;
                break;
            default:
                color = COLORS.reset;
        }

        return this.colorize(color, `[${text}]`);
    }

    /**
     * Apply color to text
     */
    private colorize(color: string, text: string): string {
        const isProduction = process.env.NODE_ENV === 'production';
        if (!this.config.colors || isProduction) {
            return text;
        }

        return `${color}${text}${COLORS.reset}`;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<FormatterConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default formatters
 */
export const productionFormatter = new LogFormatter({
    pretty: false,
    colors: false,
    timestampFormat: 'iso'
});

export const developmentFormatter = new LogFormatter({
    pretty: true,
    colors: true,
    timestampFormat: 'iso'
});

/**
 * Get appropriate formatter based on environment
 */
export function getFormatter(): LogFormatter {
    return process.env.NODE_ENV === 'production'
        ? productionFormatter
        : developmentFormatter;
}
