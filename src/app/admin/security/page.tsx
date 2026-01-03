
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, ShieldAlert, Activity, Lock, RefreshCw, ServerOff } from 'lucide-react';
import { logger } from '@/utils/logger';

interface SecurityStats {
    redisStatus: 'connected' | 'disconnected' | 'error' | 'not_configured' | 'unknown';
    totalRequests: number;
    blockedRequests: number;
    suspiciousActivity: any[];
    blockedIps: any[];
    systemHealth: 'healthy' | 'degraded' | 'critical';
    isPanicMode?: boolean;
}

export default function SecurityDashboard() {
    const [stats, setStats] = useState<SecurityStats | null>(null);
    const [loading, setLoading] = useState(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [processing, setProcessing] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/security/stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setStats(data);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            setError('Failed to connect to Security Service');
            // Set mock/degraded state
            setStats({
                redisStatus: 'disconnected',
                totalRequests: 0,
                blockedRequests: 0,
                suspiciousActivity: [],
                blockedIps: [],
                systemHealth: 'critical',
                isPanicMode: false
            });
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: string, payload: any = {}) => {
        try {
            setProcessing(action);
            const res = await fetch('/api/admin/security/actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...payload })
            });

            if (!res.ok) throw new Error('Action failed');

            // Refresh stats after action
            await fetchStats();
        } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            alert('Failed to execute action');
        } finally {
            setProcessing(null);
        }
    };

    const togglePanicMode = () => {
        handleAction('toggle_panic_mode', { enabled: !stats?.isPanicMode });
    };

    useEffect(() => {
        fetchStats();
        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const getHealthColor = (health: string) => {
        switch (health) {
            case 'healthy': return 'bg-green-500';
            case 'degraded': return 'bg-yellow-500';
            case 'critical': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen dark:bg-slate-950 text-slate-900 dark:text-slate-50">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Security Command Center</h1>
                    <p className="text-muted-foreground mt-1">
                        Real-time monitoring and threat management
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                    <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* System Status Alert */}
            {stats?.redisStatus !== 'connected' && (
                <Alert variant="destructive">
                    <ServerOff className="h-4 w-4" />
                    <AlertTitle>Connection Issue</AlertTitle>
                    <AlertDescription>
                        Could not connect to Redis Stats Service. Real-time metrics may be unavailable.
                        (Status: {stats?.redisStatus})
                    </AlertDescription>
                </Alert>
            )}

            {/* Panic Mode Active Alert */}
            {stats?.isPanicMode && (
                <Alert className="border-red-500 bg-red-50 dark:bg-red-900/20">
                    <ShieldAlert className="h-4 w-4 text-red-600" />
                    <AlertTitle className="text-red-600 font-bold">PANIC MODE ACTIVE</AlertTitle>
                    <AlertDescription className="text-red-600">
                        System is currently in lockdown. Strict rate limits (80% reduction) are enforced.
                    </AlertDescription>
                </Alert>
            )}

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Health</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <div className={`h-3 w-3 rounded-full ${getHealthColor(stats?.systemHealth || 'unknown')}`} />
                            <div className="text-2xl font-bold capitalize">{stats?.systemHealth || 'Unknown'}</div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Redis: {stats?.redisStatus}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalRequests.toLocaleString() || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Processed in current window
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Blocked Threats</CardTitle>
                        <ShieldAlert className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats?.blockedRequests.toLocaleString() || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Auto-blocked by Rate Limiter
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Blocks</CardTitle>
                        <Lock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.blockedIps.length || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            IPs permanently banned
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex gap-4">
                <Button
                    variant={stats?.isPanicMode ? "secondary" : "destructive"}
                    className="w-full md:w-auto"
                    onClick={togglePanicMode}
                    disabled={processing === 'toggle_panic_mode'}
                >
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    {stats?.isPanicMode ? 'DEACTIVATE PANIC MODE' : 'ACTIVATE PANIC MODE'}
                </Button>
            </div>

            <Tabs defaultValue="blocked" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
                    <TabsTrigger value="activity">Suspicious Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="blocked" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Permanent Blacklist</CardTitle>
                            <CardDescription>IP addresses currently banned from accessing the API.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>IP Address</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Blocked At</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats?.blockedIps.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center">No blocked IPs found.</TableCell>
                                        </TableRow>
                                    ) : (
                                        stats?.blockedIps.map((block) => (
                                            <TableRow key={block.ip}>
                                                <TableCell className="font-mono">{block.ip}</TableCell>
                                                <TableCell>{block.reason}</TableCell>
                                                <TableCell>{new Date(block.blockedAt).toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleAction('unblock_ip', { ip: block.ip })}
                                                        disabled={processing === 'unblock_ip'}
                                                    >
                                                        Unblock
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="activity" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Suspicious Activity</CardTitle>
                            <CardDescription>Real-time stream of identified threats (Last 20 events).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Severity</TableHead>
                                        <TableHead>Target</TableHead>
                                        <TableHead>IP</TableHead>
                                        <TableHead>Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {stats?.suspiciousActivity.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center">No recent suspicious activity.</TableCell>
                                        </TableRow>
                                    ) : (
                                        stats?.suspiciousActivity.map((activity, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell className="capitalize">{activity.type?.replace('_', ' ')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={activity.severity === 'critical' ? 'destructive' : 'secondary'}>
                                                        {activity.severity}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">{activity.endpoint}</TableCell>
                                                <TableCell className="font-mono text-xs">{activity.ip}</TableCell>
                                                <TableCell>{new Date(activity.timestamp).toLocaleTimeString()}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
