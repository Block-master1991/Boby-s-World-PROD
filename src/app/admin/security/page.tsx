"use client";

import { PanicModeControl } from "@/components/admin/security/PanicModeControl";
import { SecurityAlerts } from "@/components/admin/security/SecurityAlerts";
import { SecurityHeader } from "@/components/admin/security/SecurityHeader";
import { SecurityStatsGrid } from "@/components/admin/security/SecurityStatsGrid";
import { SecurityTabs } from "@/components/admin/security/SecurityTabs";
import { useSecurityDashboard } from "@/hooks/useSecurityDashboard";

export default function SecurityDashboard() {
  const { stats, loading, lastUpdated, processing, fetchStats, togglePanicMode, unblockIp } =
    useSecurityDashboard();

  if (!stats) return null;

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen dark:bg-slate-950 text-slate-900 dark:text-slate-50">
      <SecurityHeader lastUpdated={lastUpdated} onRefresh={fetchStats} loading={loading} />

      <SecurityAlerts redisStatus={stats.redisStatus} isPanicMode={!!stats.isPanicMode} />

      <SecurityStatsGrid stats={stats} />

      <PanicModeControl
        isPanicMode={!!stats.isPanicMode}
        isProcessing={processing === "toggle_panic_mode"}
        onToggle={togglePanicMode}
      />

      <SecurityTabs
        blockedIps={stats.blockedIps}
        suspiciousActivity={stats.suspiciousActivity}
        onUnblock={unblockIp}
        isProcessing={processing === "unblock_ip"}
      />
    </div>
  );
}
