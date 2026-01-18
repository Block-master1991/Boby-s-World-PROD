/**
 * Log Query Service - Simple Search Interface for Logs
 * Provides capabilities to filter and search logs
 */

export interface LogEntry {
    timestamp: number;
    level: string;
    message: string;
    metadata?: {
        userId?: string;
        ipAddress?: string;
        latency?: number;
        path?: string;
        correlationId?: string;
    };
    eventType?: string;
    _type?: string;
}

export interface LogStats {
    totalLogs: number;
    errors: number;
    warnings: number;
    avgLatency: number;
    recentActivity: Array<{
        time: string;
        count: number;
    }>;
}

export interface LogQueryFilters {
    level?: string;
    userId?: string;
    correlationId?: string;
    startTime?: number;
    endTime?: number;
    text?: string;
    limit?: number;
    offset?: number;
    type?: 'audit' | 'performance' | 'business' | 'app';
}

export interface LogQueryResult {
    logs: LogEntry[];
    total: number;
    scannedCount: number;
}

/**
 * Abstract Log Storage Backend
 */
export interface LogStorageBackend {
    query(filters: LogQueryFilters): LogQueryResult;
    save(log: LogEntry): void;
    getStats(): LogStats;
}

/**
 * Memory Storage Backend (For Dev/Testing)
 */
export class MemoryLogStorage implements LogStorageBackend {
    private logs: LogEntry[] = [];
    private maxLogs = 10000;

    constructor() {
        // Generate Mock Data for Dashboard Demonstration
        this.generateMockData();
    }

    getStats(): LogStats {
        const stats: LogStats = {
            totalLogs: this.logs.length,
            errors: this.logs.filter(l => l.level === 'error').length,
            warnings: this.logs.filter(l => l.level === 'warn').length,
            avgLatency: 0,
            recentActivity: []
        };

        // Calc avg latency for performance logs
        const perfLogs = this.logs.filter(l => l.metadata?.latency);
        if (perfLogs.length > 0) {
            const sum = perfLogs.reduce((acc, l) => acc + l.metadata!.latency!, 0);
            stats.avgLatency = Math.round(sum / perfLogs.length);
        }

        // Last 24h activity chart data (simplified)
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const recent = this.logs.filter(l => l.timestamp > now - oneDay);

        // Group by hour
        const buckets = new Map<number, number>();
        recent.forEach(l => {
            const hour = Math.floor(l.timestamp / (1000 * 60 * 60));
            buckets.set(hour, (buckets.get(hour) || 0) + 1);
        });

        // Format for Chart
        stats.recentActivity = Array.from(buckets.entries())
            .map(([h, count]) => ({ hour: h, count }))
            .sort((a, b) => a.hour - b.hour)
            .map(item => ({
                time: `${new Date(item.hour * 3600000).getHours()}:00`,
                count: item.count
            }));

        return stats;
    }

    private generateMockData() {
        const types = ['audit', 'performance', 'business', 'app'];
        const levels = ['info', 'warn', 'error', 'debug'];
        const events = ['LOGIN', 'PURCHASE', 'ERROR', 'VIEW', 'API_CALL'];

        const now = Date.now();

        for (let i = 0; i < 50; i++) {
            const timeOffset = Math.floor(Math.random() * 86400000); // last 24h
            const isError = Math.random() > 0.8;

            this.logs.push({
                timestamp: now - timeOffset,
                level: isError ? 'error' : levels[Math.floor(Math.random() * levels.length)]!,
                message: `Sample Log Entry #${i}`,
                metadata: {
                    userId: `user_${Math.floor(Math.random() * 10)}`,
                    ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
                    latency: Math.floor(Math.random() * 200),
                    path: '/api/test'
                },
                eventType: events[Math.floor(Math.random() * events.length)]!,
                _type: types[Math.floor(Math.random() * types.length)]!
            });
        }

        // Sort by time desc
        this.logs.sort((a, b) => b.timestamp - a.timestamp);
    }

    save(log: LogEntry): void {
        this.logs.unshift(log);
        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
    }

    query(filters: LogQueryFilters): LogQueryResult {
        let filtered = this.logs;

        if (filters.level && filters.level !== 'all') {
            filtered = filtered.filter(l => l.level === filters.level);
        }
        if (filters.userId) {
            filtered = filtered.filter(l => l.metadata?.userId && l.metadata.userId.includes(filters.userId!));
        }
        if (filters.correlationId) {
            filtered = filtered.filter(l => l.metadata?.correlationId === filters.correlationId);
        }
        if (filters.startTime) {
            filtered = filtered.filter(l => l.timestamp >= filters.startTime!);
        }
        if (filters.endTime) {
            filtered = filtered.filter(l => l.timestamp <= filters.endTime!);
        }
        if (filters.text) {
            const search = filters.text.toLowerCase();
            filtered = filtered.filter(l =>
                l.message.toLowerCase().includes(search) ||
                JSON.stringify(l).toLowerCase().includes(search)
            );
        }
        // Custom type filter for our mock data
        if (filters.type && (filters.type as string) !== 'all') {
            filtered = filtered.filter(l => l._type === filters.type);
        }

        const total = filtered.length;
        const offset = filters.offset || 0;
        const limit = filters.limit || 50;

        return {
            logs: filtered.slice(offset, offset + limit),
            total,
            scannedCount: this.logs.length
        };
    }
}

/**
 * Log Query Service
 */
export class LogQueryService {
    private static instance: LogQueryService;
    private backend: LogStorageBackend;

    private constructor() {
        this.backend = new MemoryLogStorage();
    }

    public static getInstance(): LogQueryService {
        if (!LogQueryService.instance) {
            LogQueryService.instance = new LogQueryService();
        }
        return LogQueryService.instance;
    }

    setBackend(backend: LogStorageBackend) {
        this.backend = backend;
    }

    search(filters: LogQueryFilters): LogQueryResult {
        return this.backend.query(filters);
    }

    getStats(): LogStats {
        return this.backend.getStats();
    }

    // Helper to add logs from anywhere
    ingest(log: LogEntry): void {
        this.backend.save(log);
    }
}

export const logQueryService = LogQueryService.getInstance();
