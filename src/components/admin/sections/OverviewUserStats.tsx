'use client';

import { AdminUserStatsSkeleton } from '@/components/admin/AdminStatSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

export interface UserStatsPayload {
  userStats?: {
    totalUsers: number;
    onlineUsers: number;
    offlineUsers: number;
  };
}

interface OverviewUserStatsProps {
  loading: boolean;
  error: unknown;
  data: UserStatsPayload | null;
}

export function OverviewUserStats({ loading, error, data }: OverviewUserStatsProps) {
  return (
    <Card className="relative overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full"></div>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-500" />
          User Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <AdminUserStatsSkeleton />
        ) : error ? (
          <p className="text-sm text-destructive">Error loading stats</p>
        ) : (
          <>
            <p className="text-3xl font-bold">{data?.userStats?.totalUsers ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Players</p>
            <div className="mt-3 flex gap-4">
              <div>
                <p className="text-lg font-semibold text-green-500">
                  {data?.userStats?.onlineUsers ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Online</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-400">
                  {data?.userStats?.offlineUsers ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
