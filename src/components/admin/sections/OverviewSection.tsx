'use client';

import type { LiveActivityPayload } from '@/components/admin/sections/OverviewLiveActivity';
import { OverviewLiveActivity } from '@/components/admin/sections/OverviewLiveActivity';
import { OverviewQuickActions } from '@/components/admin/sections/OverviewQuickActions';
import type { UserStatsPayload } from '@/components/admin/sections/OverviewUserStats';
import { OverviewUserStats } from '@/components/admin/sections/OverviewUserStats';
import { OverviewWelcomeBanner } from '@/components/admin/sections/OverviewWelcomeBanner';

interface OverviewSectionProps {
  graphqlLoading: boolean;
  graphqlError: unknown;
  graphqlUserStats: UserStatsPayload | null;
  liveActivityData: LiveActivityPayload | null;
  activityError: unknown;
  setActiveSection: (section: string) => void;
}

export function OverviewSection({
  graphqlLoading,
  graphqlError,
  graphqlUserStats,
  liveActivityData,
  activityError,
  setActiveSection,
}: OverviewSectionProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <OverviewWelcomeBanner />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OverviewUserStats
          loading={graphqlLoading}
          error={graphqlError}
          data={graphqlUserStats}
        />
        <OverviewLiveActivity
          error={activityError}
          data={liveActivityData}
        />
        <OverviewQuickActions setActiveSection={setActiveSection} />
      </div>
    </div>
  );
}
