'use client';

import { Button } from '@/components/ui/button';
import { Clock, RefreshCw, Search } from 'lucide-react';
import React from 'react';

interface LogFiltersProps {
    searchText: string; setSearchText: (v: string) => void;
    pageSize: number; setPageSize: (v: number) => void;
    filterLevel: string; setFilterLevel: (v: string) => void;
    filterType: string; setFilterType: (v: string) => void;
    autoRefresh: boolean; setAutoRefresh: (v: boolean) => void;
    fetchLogs: () => void; loading: boolean; onResetPage: () => void;
}

interface FilterSelectProps {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
}

const FilterSelect: React.FC<FilterSelectProps> = ({ label, value, options, onChange }) => (
    <select
        className="bg-background border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
    >
        <option value="all">All {label}s</option>
        {options.map((o) => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
        ))}
    </select>
);

export const LogFilters: React.FC<LogFiltersProps> = (p) => (
    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                    type="text" placeholder="Search..."
                    className="w-full bg-background border rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    value={p.searchText}
                    onChange={(e) => { p.setSearchText(e.target.value); p.onResetPage(); }}
                />
            </div>
            <select
                className="bg-background border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/20"
                value={p.pageSize}
                onChange={(e) => { p.setPageSize(Number(e.target.value)); p.onResetPage(); }}
            >
                {[20, 50, 100, 200].map(v => <option key={v} value={v}>{v} per page</option>)}
            </select>
            <FilterSelect label="Level" value={p.filterLevel} options={['info', 'warn', 'error', 'debug']} onChange={(v) => { p.setFilterLevel(v); p.onResetPage(); }} />
            <FilterSelect label="Type" value={p.filterType} options={['audit', 'performance', 'business', 'app']} onChange={(v) => { p.setFilterType(v); p.onResetPage(); }} />
        </div>
        <div className="flex gap-2">
            <Button variant={p.autoRefresh ? "secondary" : "outline"} size="sm" onClick={() => p.setAutoRefresh(!p.autoRefresh)}>
                <Clock className="w-4 h-4 mr-2" /> {p.autoRefresh ? 'Live On' : 'Live Off'}
            </Button>
            <Button variant="outline" size="sm" onClick={p.fetchLogs} disabled={p.loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${p.loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
        </div>
    </div>
);
