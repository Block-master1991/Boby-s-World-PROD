"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LogStats } from "@/hooks/useLoggerDashboardModules";
import { Activity, AlertTriangle, Clock } from "lucide-react";
import React from "react";

export const StatsCards: React.FC<{ stats: LogStats | null }> = ({ stats }) => {
  const items = [
    {
      title: "Total Activity",
      value: stats?.totalLogs || 0,
      sub: "Total captured events",
      icon: Activity,
      color: "blue",
    },
    {
      title: "System Errors",
      value: stats?.errors || 0,
      sub: "Critical issues detected",
      icon: AlertTriangle,
      color: "red",
      highlight: true,
    },
    {
      title: "Avg Latency",
      value: `${stats?.avgLatency || 0}ms`,
      sub: "Performance specific calls",
      icon: Clock,
      color: "green",
    },
    {
      title: "Warnings",
      value: stats?.warnings || 0,
      sub: "Potential issues",
      icon: AlertTriangle,
      color: "amber",
      highlight: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item, i) => (
        <Card
          key={i}
          className="relative overflow-hidden hover:shadow-md transition-all duration-200"
        >
          <div
            className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-${item.color}-500/10 to-transparent rounded-bl-full`}
          ></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg bg-${item.color}-500/10`}
            >
              <item.icon className={`h-4 w-4 text-${item.color}-500`} />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${item.highlight && item.color === "red" ? "text-red-500" : item.color === "amber" ? "text-amber-500" : ""}`}
            >
              {item.value}
            </div>
            <p className="text-xs text-muted-foreground">{item.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
