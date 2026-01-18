'use client';

import { useCallback, useState } from 'react';

export interface LogEntry {
    timestamp: number;
    level: string;
    message: string;
    metadata: Record<string, unknown>;
    eventType?: string;
    _type?: string;
}

export interface LogStats {
    totalLogs: number;
    errors: number;
    warnings: number;
    avgLatency: number;
    recentActivity: Array<{ time: string; count: number }>;
}

export const useLoggerState = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [filterLevel, setFilterLevel] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalLogs, setTotalLogs] = useState(0);

    return {
        logs, setLogs, stats, setStats, loading, setLoading,
        filterLevel, setFilterLevel, filterType, setFilterType,
        searchText, setSearchText, autoRefresh, setAutoRefresh,
        currentPage, setCurrentPage, pageSize, setPageSize, totalLogs, setTotalLogs
    };
};

export const useLoggerFetch = (state: ReturnType<typeof useLoggerState>, apiFetch: (url: string) => Promise<Response>) => {
    const { 
        setLoading, filterLevel, filterType, searchText, pageSize, currentPage, 
        setLogs, setTotalLogs, setStats 
    } = state;

    return useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterLevel !== 'all') params.append('level', filterLevel);
            if (filterType !== 'all') params.append('type', filterType);
            if (searchText) params.append('search', searchText);
            params.append('limit', pageSize.toString());
            params.append('offset', ((currentPage - 1) * pageSize).toString());

            const [logsRes, statsRes] = await Promise.all([
                apiFetch(`/api/admin/logs?${params}`),
                apiFetch('/api/admin/metrics')
            ]);

            if (logsRes.ok) {
                const data = await logsRes.json();
                setLogs(data.logs);
                setTotalLogs(data.total || 0);
            }
            if (statsRes.ok) setStats(await statsRes.json());
        } catch (error) {
            import('@/utils/logger').then(({ logger }) => logger.error('Fetch failed', error));
        } finally {
            setLoading(false);
        }
    }, [apiFetch, filterLevel, filterType, searchText, currentPage, pageSize, setLoading, setLogs, setTotalLogs, setStats]);
};
