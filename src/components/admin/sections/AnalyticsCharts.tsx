"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

// Dynamic import for ChartWrapper
const ChartUIWrapper = dynamic(() => import("@/components/admin/ChartUIWrapper"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});

interface AnalyticsChartsProps {
  userStats: { totalUsers: number; onlineUsers: number; offlineUsers: number } | null;
}

export function AnalyticsCharts({ userStats }: AnalyticsChartsProps) {
  // Chart data for analytics
  const userChartData = [
    { name: "Online", value: userStats?.onlineUsers || 0, color: "#22c55e" },
    { name: "Offline", value: userStats?.offlineUsers || 0, color: "#64748b" },
  ];

  const activityData = [
    { month: "Jan", users: 120 },
    { month: "Feb", users: 150 },
    { month: "Mar", users: 180 },
    { month: "Apr", users: 200 },
    { month: "May", users: 220 },
    { month: "Jun", users: 250 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* User Status Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartUIWrapper type="pie" data={userChartData} />
        </CardContent>
      </Card>

      {/* Activity Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Activity Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartUIWrapper
            type="line"
            data={activityData.map(d => ({ name: d.month, value: d.users }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
