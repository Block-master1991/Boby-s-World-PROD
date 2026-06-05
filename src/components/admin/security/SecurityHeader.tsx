"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface SecurityHeaderProps {
  lastUpdated: Date;
  onRefresh: () => void;
  loading: boolean;
}

export function SecurityHeader({ lastUpdated, onRefresh, loading }: SecurityHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Command Center</h1>
        <p className="text-muted-foreground mt-1">Real-time monitoring and threat management</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </span>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
