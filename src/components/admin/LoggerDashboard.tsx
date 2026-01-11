'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, RefreshCw, Filter, AlertTriangle,
    Activity, Database, Shield, FileText, Clock,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
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

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalLogs, setTotalLogs] = useState(0);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterLevel !== 'all') params.append('level', filterLevel);
            if (filterType !== 'all') params.append('type', filterType);
            if (searchText) params.append('search', searchText);
            
            // Pagination params
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

            if (statsRes.ok) {
                const statsData = await statsRes.json();
                setStats(statsData);
            }
        } catch (error) {
            logger.error('Failed to fetch dashboard data', error);
        } finally {
            setLoading(false);
        }
    }, [apiFetch, filterLevel, filterType, searchText, currentPage, pageSize]);

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
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full"></div>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                            <Activity className="h-4 w-4 text-blue-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalLogs || 0}</div>
                        <p className="text-xs text-muted-foreground">Total captured events</p>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-red-500/10 to-transparent rounded-bl-full"></div>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Errors</CardTitle>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{stats?.errors || 0}</div>
                        <p className="text-xs text-muted-foreground">Critical issues detected</p>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-green-500/10 to-transparent rounded-bl-full"></div>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                            <Clock className="h-4 w-4 text-green-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.avgLatency || 0}ms</div>
                        <p className="text-xs text-muted-foreground">Performance specific calls</p>
                    </CardContent>
                </Card>

                <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full"></div>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Warnings</CardTitle>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">{stats?.warnings || 0}</div>
                        <p className="text-xs text-muted-foreground">Potential issues</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters & Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search in messages or metadata..."
                            className="w-full bg-background border rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                            value={searchText}
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                setCurrentPage(1); // Reset to page 1 on search
                            }}
                        />
                    </div>
                    <select
                        className="bg-background border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                    >
                        <option value={20}>20 per page</option>
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                        <option value={200}>200 per page</option>
                    </select>
                    <select
                        className="bg-background border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                        value={filterLevel}
                        onChange={(e) => {
                            setFilterLevel(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="all">All Levels</option>
                        <option value="info">Info</option>
                        <option value="warn">Warning</option>
                        <option value="error">Error</option>
                        <option value="debug">Debug</option>
                    </select>
                    <select
                        className="bg-background border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                        value={filterType}
                        onChange={(e) => {
                            setFilterType(e.target.value);
                            setCurrentPage(1);
                        }}
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
                <CardContent className="p-0">
                    <div className="hidden md:block">
                        <table className="w-full text-sm border-t">
                            <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] font-bold tracking-wider">
                                <tr>
                                    <th className="p-4 text-left w-[180px]">Timestamp</th>
                                    <th className="p-4 text-left w-[100px]">Level</th>
                                    <th className="p-4 text-left w-[120px]">Type</th>
                                    <th className="p-4 text-left min-w-[300px]">Message</th>
                                    <th className="p-4 text-left w-[350px]">Metadata</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {loading && logs.length === 0 ? (
                                    [1, 2, 3, 4, 5].map(i => (
                                        <tr key={i}><td colSpan={5} className="p-4"><Skeleton className="h-10 w-full" /></td></tr>
                                    ))
                                ) : logs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-12 text-center text-muted-foreground italic">No logs found matching your filters</td></tr>
                                ) : (
                                    logs.map((log, idx) => (
                                        <tr key={idx} className="hover:bg-muted/30 transition-colors group">
                                            <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap align-top">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="p-4 align-top">
                                                <Badge variant={getLevelBadge(log.level) as any} className="font-bold text-[10px] px-2">
                                                    {log.level.toUpperCase()}
                                                </Badge>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 rounded-md bg-muted group-hover:bg-background transition-colors">
                                                        {getLogIcon(log._type)}
                                                    </div>
                                                    <span className="capitalize text-xs font-semibold">{log._type || 'App'}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="font-medium leading-relaxed break-words">{log.message}</span>
                                                    {log.eventType && (
                                                        <Badge variant="outline" className="w-fit text-[9px] px-1.5 h-4 font-normal opacity-70 bg-muted/20">
                                                            {log.eventType}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="bg-muted/40 group-hover:bg-muted/60 p-2.5 rounded-lg text-[10px] font-mono text-muted-foreground break-all overflow-y-auto max-h-[100px] border border-transparent group-hover:border-border/30 transition-all">
                                                    {JSON.stringify(log.metadata || {}, null, 2)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-border/50">
                        {loading && logs.length === 0 ? (
                            [1, 2, 3].map(i => (
                                <div key={i} className="p-4 space-y-3">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-8 w-1/2" />
                                </div>
                            ))
                        ) : logs.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground italic">No logs found</div>
                        ) : (
                            logs.map((log, idx) => (
                                <div key={idx} className="p-5 space-y-4 hover:bg-muted/10 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[10px] text-muted-foreground">
                                            {new Date(log.timestamp).toLocaleString(undefined, {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                        <Badge variant={getLevelBadge(log.level) as any} className="text-[9px] font-bold px-1.5 h-4">
                                            {log.level.toUpperCase()}
                                        </Badge>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 w-fit">
                                        {getLogIcon(log._type)}
                                        <span className="capitalize text-[11px] font-bold">{log._type || 'App'}</span>
                                        {log.eventType && (
                                            <>
                                                <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                                <span className="text-[10px] text-muted-foreground">{log.eventType}</span>
                                            </>
                                        )}
                                    </div>

                                    <div className="text-sm font-medium leading-normal text-foreground/90">
                                        {log.message}
                                    </div>

                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">Metadata</span>
                                        <div className="bg-muted/30 p-3 rounded-xl border border-border/50 text-[10px] font-mono text-muted-foreground break-all leading-relaxed">
                                            {JSON.stringify(log.metadata || {}, null, 2)}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>

                {/* Pagination Footer */}
                {logs.length > 0 && (
                    <div className="border-t p-4 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-muted-foreground font-medium order-2 sm:order-1">
                            Showing <span className="text-foreground font-bold">{((currentPage - 1) * pageSize) + 1}</span> to{' '}
                            <span className="text-foreground font-bold">{Math.min(currentPage * pageSize, totalLogs)}</span> of{' '}
                            <span className="text-foreground font-bold">{totalLogs}</span> entries
                        </div>
                        
                        <div className="flex items-center gap-1 order-1 sm:order-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1 || loading}
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1 || loading}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            
                            <div className="flex items-center px-4 h-8 bg-background border rounded-md text-xs font-bold shadow-sm">
                                Page {currentPage} of {Math.max(1, Math.ceil(totalLogs / pageSize))}
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalLogs / pageSize), prev + 1))}
                                disabled={currentPage >= Math.ceil(totalLogs / pageSize) || loading}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(Math.ceil(totalLogs / pageSize))}
                                disabled={currentPage >= Math.ceil(totalLogs / pageSize) || loading}
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
