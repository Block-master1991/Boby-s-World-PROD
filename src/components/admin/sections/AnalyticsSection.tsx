'use client';

import { AnalyticsCharts } from '@/components/admin/sections/AnalyticsCharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AnalyticsSectionProps {
  userStats: { totalUsers: number; onlineUsers: number; offlineUsers: number } | null;
}

export function AnalyticsSection({ userStats }: AnalyticsSectionProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Analytics Dashboard</CardTitle>
          <CardDescription>View detailed analytics and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsCharts userStats={userStats} />
        </CardContent>
      </Card>
    </div>
  );
}
