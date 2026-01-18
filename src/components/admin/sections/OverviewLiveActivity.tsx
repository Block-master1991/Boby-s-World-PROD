'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export interface LiveActivityPayload {
  onlineUsers: number;
  activeGames: number;
}

interface OverviewLiveActivityProps {
  error: unknown;
  data: LiveActivityPayload | null;
}

export function OverviewLiveActivity({ error, data }: OverviewLiveActivityProps) {
  return (
    <Card className="relative overflow-hidden border-green-500/20 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/20 to-transparent rounded-bl-full"></div>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4 text-green-500" />
          Live Activity
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">Live updates unavailable</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-green-500">{data?.onlineUsers ?? 0}</p>
            <p className="text-sm text-muted-foreground">Users Online Now</p>
            <div className="mt-3">
              <p className="text-lg font-semibold">{data?.activeGames ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active Game Sessions</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
