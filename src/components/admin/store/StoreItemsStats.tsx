'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { StoreItem } from '@/hooks/useStoreItemsManagement';
import { Package } from 'lucide-react';
import React from 'react';
import { AdminStatSkeleton } from '../AdminStatSkeleton';

interface StoreItemsStatsProps {
    items: StoreItem[];
    loading: boolean;
}

export const StoreItemsStats: React.FC<StoreItemsStatsProps> = ({ items, loading }) => {
    if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><AdminStatSkeleton /><AdminStatSkeleton /><AdminStatSkeleton /><AdminStatSkeleton /></div>;

    const stats = [
        { label: 'Total Items', value: items.length, icon: Package, color: 'blue' },
        { label: 'Active', value: items.filter(i => i.isActive).length, dot: 'green', color: 'green' },
        { label: 'Consumable', value: items.filter(i => i.type === 'consumable').length, dot: 'amber', color: 'amber' },
        { label: 'Permanent', value: items.filter(i => i.type === 'permanent').length, dot: 'purple', color: 'purple' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s, i) => (
                <Card key={i} className="relative overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-${s.color}-500/10 to-transparent rounded-bl-full`}></div>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${s.color}-500/10`}>
                                {s.icon ? <s.icon className={`h-5 w-5 text-${s.color}-500`} /> : <div className={`h-3 w-3 bg-${s.dot}-500 rounded-full`} />}
                            </div>
                            <div>
                                <p className={`text-2xl font-bold ${s.dot ? `text-${s.dot}-500` : ''}`}>{s.value}</p>
                                <p className="text-xs text-muted-foreground">{s.label}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
};
