'use client';

import { Badge } from '@/components/ui/badge';
import type { LogEntry } from '@/hooks/useLoggerDashboardModules';
import { Activity, Database, FileText, Shield } from 'lucide-react';
import React from 'react';

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

export const LogTableRow: React.FC<{ log: LogEntry }> = ({ log }) => (
    <tr className="hover:bg-muted/30 transition-colors group">
        <td className="p-4 font-mono text-xs text-muted-foreground whitespace-nowrap align-top">
            {new Date(log.timestamp).toLocaleString()}
        </td>
        <td className="p-4 align-top">
            <Badge variant={getLevelVariant(log.level)} className="font-bold text-[10px] px-2">
                {log.level.toUpperCase()}
            </Badge>
        </td>
        <td className="p-4 align-top">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-muted group-hover:bg-background transition-colors">{getLogIcon(log._type)}</div>
                <span className="capitalize text-xs font-semibold">{log._type || 'App'}</span>
            </div>
        </td>
        <td className="p-4 align-top">
            <div className="flex flex-col gap-1.5">
                <span className="font-medium leading-relaxed break-words">{log.message}</span>
                {log.eventType && <Badge variant="outline" className="w-fit text-[9px] px-1.5 h-4 font-normal opacity-70 bg-muted/20">{log.eventType}</Badge>}
            </div>
        </td>
        <td className="p-4 align-top">
            <div className="bg-muted/40 group-hover:bg-muted/60 p-2.5 rounded-lg text-[10px] font-mono text-muted-foreground break-all overflow-y-auto max-h-[100px] border border-transparent group-hover:border-border/30 transition-all">
                {JSON.stringify(log.metadata || {}, null, 2)}
            </div>
        </td>
    </tr>
);
