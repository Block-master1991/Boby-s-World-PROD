'use client';

import { useUserActivityUpdates, useUserStats } from '@/hooks/useAdminStats';
import { useApiFetch } from '@/utils/api';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

export interface UserStatsState {
  totalUsers: number;
  onlineUsers: number;
  offlineUsers: number;
}

export function useAdminDashboardData(isAdmin: boolean) {
  const [userStats, setUserStats] = useState<UserStatsState | null>(null);
  const { apiFetch } = useApiFetch();
  
  // GraphQL Stats Hooks
  const { data: graphqlUserStats, loading: graphqlLoading, error: graphqlError } = useUserStats();
  const { data: liveActivityData, error: activityError } = useUserActivityUpdates();

  const fetchUserStats = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch user statistics');
      const data = await response.json();
      setUserStats(data);
    } catch (err) {
      logger.error('Error fetching user stats:', err as Error);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (isAdmin) {
      fetchUserStats();
    }
  }, [isAdmin, fetchUserStats]);

  return {
    userStats,
    graphqlUserStats,
    graphqlLoading,
    graphqlError,
    liveActivityData,
    activityError
  };
}
