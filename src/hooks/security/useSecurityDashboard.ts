"use client";

import { useToast } from "@/hooks/ui/use-toast";
import type { SecurityStats } from "@/types/security";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useState } from "react";

const MOCK_STATS: SecurityStats = {
  redisStatus: "disconnected",
  totalRequests: 0,
  blockedRequests: 0,
  suspiciousActivity: [],
  blockedIps: [],
  systemHealth: "critical",
  isPanicMode: false,
};

type ToastFunction = ReturnType<typeof useToast>["toast"];
type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

async function fetchStatsApi(
  setStats: SetState<SecurityStats | null>,
  setError: SetState<string | null>,
  setLastUpdated: SetState<Date>,
  setLoading: SetState<boolean>
) {
  try {
    const res = await fetch("/api/admin/security/stats");
    if (!res.ok) throw new Error("Failed to fetch stats");
    setStats(await res.json());
    setError(null);
    setLastUpdated(new Date());
  } catch (err: unknown) {
    logger.error(
      "Security Dashboard Fetch Error:",
      err instanceof Error ? err.message : String(err)
    );
    setError("Failed to connect");
    setStats(prev => prev || MOCK_STATS);
  } finally {
    setLoading(false);
  }
}

async function performAction(
  action: string,
  payload: unknown,
  fetchStats: () => Promise<void>,
  toast: ToastFunction
) {
  try {
    const res = await fetch("/api/admin/security/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(payload as object) }),
    });
    if (!res.ok) throw new Error("Action failed");
    toast({ title: "Success", description: "Action executed successfully" });
    await fetchStats();
  } catch (err) {
    logger.error("Security Action Error:", err instanceof Error ? err.message : String(err));
    toast({ title: "Error", description: "Failed to execute action", variant: "destructive" });
  }
}

export function useSecurityDashboard() {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [processing, setProcessing] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStats = useCallback(async () => {
    if (!stats) setLoading(true);
    await fetchStatsApi(setStats, setError, setLastUpdated, setLoading);
  }, [stats]);

  const handleAction = async (action: string, payload: unknown = {}) => {
    setProcessing(action);
    await performAction(action, payload, fetchStats, toast);
    setProcessing(null);
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    lastUpdated,
    processing,
    fetchStats,
    togglePanicMode: () => handleAction("toggle_panic_mode", { enabled: !stats?.isPanicMode }),
    unblockIp: (ip: string) => handleAction("unblock_ip", { ip }),
  };
}
