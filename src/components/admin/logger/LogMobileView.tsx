'use client';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { LogEntry } from '@/hooks/useLoggerDashboardModules';
import { Activity, Database, FileText, Shield } from 'lucide-react';
import React from 'react';

interface LogMobileViewProps {
    logs: LogEntry[];
    loading: boolean;
}

const getLevelVariant = (level: string): "destructive" | "secondary" | "default" | "outline" => {
    switch (level.toLowerCase()) {
        case 'error': return 'destructive';
        case 'warn': return 'secondary';
        case 'info': return 'default';
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

const LogMobileCard: React.FC<{ log: LogEntry }> = ({ log }) => (
    <div className="p-5 space-y-4 hover:bg-muted/10 transition-colors">
        <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
            <Badge variant={getLevelVariant(log.level)} className="text-[9px] font-bold px-1.5 h-4">{log.level.toUpperCase()}</Badge>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 w-fit">
            {getLogIcon(log._type)}
            <span className="capitalize text-[11px] font-bold">{log._type || 'App'}</span>
            {log.eventType && <><div className="w-1 h-1 rounded-full bg-muted-foreground/30" /><span className="text-[10px] text-muted-foreground">{log.eventType}</span></>}
        </div>
        <div className="text-sm font-medium leading-normal text-foreground/90">{log.message}</div>
        <div className="space-y-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-1">Metadata</span>
            <div className="bg-muted/30 p-3 rounded-xl border border-border/50 text-[10px] font-mono text-muted-foreground break-all leading-relaxed">
                {JSON.stringify(log.metadata || {}, null, 2)}
            </div>
        </div>
    </div>
);

export const LogMobileView: React.FC<LogMobileViewProps> = ({ logs, loading }) => (
    <div className="md:hidden divide-y divide-border/50">
        {loading && logs.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-4 space-y-3">
                    <Skeleton className="h-4 w-1/3" /><Skeleton className="h-12 w-full" /><Skeleton className="h-8 w-1/2" />
                </div>
            ))
        ) : logs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground italic">No logs found</div>
        ) : (
            logs.map((log, idx) => <LogMobileCard key={idx} log={log} />)
        )}
    </div>
);
