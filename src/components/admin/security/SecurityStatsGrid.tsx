'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SecurityStats } from '@/types/security';
import type { LucideIcon } from 'lucide-react';
import { Activity, Lock, Shield, ShieldAlert } from 'lucide-react';

interface StatCardProps {
  title: string;
  icon: LucideIcon;
  value: React.ReactNode;
  subtext: React.ReactNode;
  iconColor?: string;
  valueClassName?: string;
}

function StatCard({ title, icon: Icon, value, subtext, iconColor, valueClassName }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClassName || ''}`}>{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  );
}

function getHealthColor(health: string) {
  switch (health) {
    case 'healthy': return 'bg-green-500';
    case 'degraded': return 'bg-yellow-500';
    case 'critical': return 'bg-red-500';
    default: return 'bg-gray-500';
  }
}

export function SecurityStatsGrid({ stats }: { stats: SecurityStats }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="System Health"
        icon={Activity}
        value={
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${getHealthColor(stats.systemHealth || 'unknown')}`} />
            <span className="capitalize">{stats.systemHealth || 'Unknown'}</span>
          </div>
        }
        subtext={`Redis: ${stats.redisStatus}`}
      />
      <StatCard
        title="Total Requests"
        icon={Shield}
        value={stats.totalRequests.toLocaleString() || 0}
        subtext="Processed in current window"
      />
      <StatCard
        title="Blocked Threats"
        icon={ShieldAlert}
        value={stats.blockedRequests.toLocaleString() || 0}
        subtext="Auto-blocked by Rate Limiter"
        iconColor="text-red-500"
        valueClassName="text-red-600"
      />
      <StatCard
        title="Active Blocks"
        icon={Lock}
        value={stats.blockedIps.length || 0}
        subtext="IPs permanently banned"
      />
    </div>
  );
}
