'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { StoreItemDocument } from '@/types/database';
import { Package } from 'lucide-react';
import React from 'react';

interface AdminItemsStatsProps {
  items: StoreItemDocument[];
}

function StatCard({ 
  icon, 
  colorClass, 
  count, 
  label 
}: { 
  icon?: React.ReactNode; 
  colorClass?: string; 
  count: number; 
  label: string; 
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center">
          {icon ? (
            icon
          ) : (
            <div className={`h-8 w-8 ${colorClass} rounded-full mr-3`} />
          )}
          <div>
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminItemsStats({ items }: AdminItemsStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <StatCard 
        icon={<Package className="h-8 w-8 text-blue-500 mr-3" />}
        count={items.length} 
        label="Total Items" 
      />
      <StatCard 
        colorClass="bg-green-500"
        count={items.filter((i) => i.isActive).length} 
        label="Active Items" 
      />
      <StatCard 
        colorClass="bg-yellow-500"
        count={items.filter((i) => i.type === 'consumable').length} 
        label="Consumables" 
      />
      <StatCard 
        colorClass="bg-purple-500"
        count={items.filter((i) => i.type === 'permanent').length} 
        label="Permanent" 
      />
    </div>
  );
}
