'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, RefreshCw, Filter, AlertTriangle,
    Activity, Database, Shield, FileText, Clock
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApiFetch } from '@/utils/api';
import { Skeleton } from '@/components/ui/skeleton';

interface LogEntry {
    timestamp: number;
    level: string;
    message: string;
    metadata: any;
    eventType?: string;
    _type?: string;
}

interface LogStats {
    totalLogs: number;
    errors: number;
    warnings: number;
    avgLatency: number;
    recentActivity: Array<{ time: string; count: number }>;
}

export function LoggerDashboard() {
    const { apiFetch } = useApiFetch();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterLevel, setFilterLevel] = useState('all');
    const [filterType, setFilterType] = useState('all');
    const [searchText, setSearchText] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterLevel !== 'all') params.append('level', filterLevel);
            if (filterType !== 'all') params.append('type', filterType);
            if (searchText) params.append('search', searchText);
            params.append('limit', '50');

            const [logsRes, statsRes] = await Promise.all([
                apiFetch(`/api/admin/logs?${params}`),
                apiFetch('/api/admin/metrics')
            ]);

            if (logsRes.ok) {
                const data = await logsRes.json();
                setLogs(data.logs);
            }

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard data', error);
        } finally {
            setLoading(false);
        }
    }, [apiFetch, filterLevel, filterType, searchText]);

    useEffect(() => {
        fetchLogs();

        // Auto refresh interval
        let interval: NodeJS.Timeout;
        if (autoRefresh) {
            interval = setInterval(fetchLogs, 5000);
        }
        return () => clearInterval(interval);
    }, [fetchLogs, autoRefresh]);

    const getLevelBadge = (level: string) => {
        switch (level.toLowerCase()) {
            case 'error': return 'destructive';
            case 'warn': return 'secondary'; // yellow-ish usually
            case 'info': return 'default';
            case 'debug': return 'outline';
            default: return 'outline';
        }
    };

    const getLogIcon = (type?: string) => {
        switch (type) {
            case 'audit': return <Shield className="w-4 h-4 text-blue-500" />;
            case 'performance': return <Activity className="w-4 h-4 text-green-500" />;
            case 'business': return <Database className="w-4 h-4 text-purple-500" />;
            default: return <FileText className="w-4 h-4 text-gray-500" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalLogs || 0}</div>
                        <p className="text-xs text-muted-foreground">Total captured events</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Errors</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{stats?.errors || 0}</div>
                        <p className="text-xs text-muted-foreground">Critical issues detected</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
                        <Clock className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.avgLatency || 0}ms</div>
                        <p className="text-xs text-muted-foreground">Performance specific calls</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{stats?.warnings || 0}</div>
                        <p className="text-xs text-muted-foreground">Potential issues</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
                <div className="flex gap-2 items-center w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            placeholder="Search logs..."
                            className="pl-8 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                    </div>

                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                        value={filterLevel}
                        onChange={(e) => setFilterLevel(e.target.value)}
                    >
                        <option value="all">All Levels</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                        <option value="debug">Debug</option>
                    </select>

                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">All Types</option>
                        <option value="audit">Audit</option>
                        <option value="performance">Performance</option>
                        <option value="business">Business</option>
                        <option value="app">App</option>
                    </select>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant={autoRefresh ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                    >
                        <Clock className="w-4 h-4 mr-2" />
                        {autoRefresh ? 'Live On' : 'Live Off'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Logs Table */}
            <Card>
                <CardHeader>
                    <CardTitle>System Logs</CardTitle>
                    <CardDescription>Real-time stream of all system events</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="p-3 text-left w-[180px]">Timestamp</th>
                                    <th className="p-3 text-left w-[100px]">Level</th>
                                    <th className="p-3 text-left w-[120px]">Type</th>
                                    <th className="p-3 text-left">Message</th>
                                    <th className="p-3 text-left w-[200px]">Metadata</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && logs.length === 0 ? (
                                    [1, 2, 3, 4, 5].map(i => (
                                        <tr key={i}><td colSpan={5} className="p-4"><Skeleton className="h-8 w-full" /></td></tr>
                                    ))
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No logs found matching your filters</td></tr>
                                ) : (
                                    logs.map((log, idx) => (
                                        <tr key={idx} className="border-t hover:bg-muted/20 transition-colors">
                                            <td className="p-3 font-mono text-xs text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="p-3">
                                                <Badge variant={getLevelBadge(log.level) as any}>
                                                    {log.level.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    {getLogIcon(log._type)}
                                                    <span className="capitalize">{log._type || 'App'}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 font-medium text-foreground">
                                                {log.message}
                                                {log.eventType && (
                                                    <Badge variant="outline" className="ml-2 text-[10px] h-5">{log.eventType}</Badge>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <pre className="text-[10px] text-muted-foreground max-w-[200px] truncate">
                                                    {JSON.stringify(log.metadata || {}, null, 0)}
                                                </pre>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
