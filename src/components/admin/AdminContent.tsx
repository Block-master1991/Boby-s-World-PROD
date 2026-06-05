"use client";

import { LoggerDashboard } from "@/components/admin/LoggerDashboard";
import { AdminSettingsPlaceholder } from "@/components/admin/sections/AdminSettingsPlaceholder";
import { AdminUsersPlaceholder } from "@/components/admin/sections/AdminUsersPlaceholder";
import { AnalyticsSection } from "@/components/admin/sections/AnalyticsSection";
import type { LiveActivityPayload } from "@/components/admin/sections/OverviewLiveActivity";
import { OverviewSection } from "@/components/admin/sections/OverviewSection";
import type { UserStatsPayload } from "@/components/admin/sections/OverviewUserStats";
import { SecuritySection } from "@/components/admin/sections/SecuritySection";
import { StoreItemsManagement } from "@/components/admin/StoreItemsManagement";
import type { UserStatsState } from "@/hooks/useAdminDashboardData";

interface DashboardData {
  userStats: UserStatsState | null;
  graphqlUserStats: UserStatsPayload | null;
  graphqlLoading: boolean;
  graphqlError: unknown;
  liveActivityData: LiveActivityPayload | null;
  activityError: unknown;
}

interface AdminContentProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  dashboardData: DashboardData;
}

export function AdminContent({
  activeSection,
  setActiveSection,
  dashboardData,
}: AdminContentProps) {
  const {
    userStats,
    graphqlUserStats,
    graphqlLoading,
    graphqlError,
    liveActivityData,
    activityError,
  } = dashboardData;

  switch (activeSection) {
    case "overview":
      return (
        <OverviewSection
          graphqlLoading={graphqlLoading}
          graphqlError={graphqlError}
          graphqlUserStats={graphqlUserStats}
          liveActivityData={liveActivityData}
          activityError={activityError}
          setActiveSection={setActiveSection}
        />
      );
    case "security":
      return <SecuritySection />;
    case "logs":
      return <LoggerDashboard />;
    case "analytics":
      return <AnalyticsSection userStats={userStats} />;
    case "items":
      return <StoreItemsManagement />;
    case "users":
      return <AdminUsersPlaceholder />;
    case "settings":
      return <AdminSettingsPlaceholder />;
    default:
      return null;
  }
}
