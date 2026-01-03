/**
 * Admin-specific hook wrappers that utilize unified logic from useGraphQL
 * This ensures professional architecture, consistency, and easy maintenance.
 */

import { useUserStats as useUserStatsShared, useUserActivityUpdates as useUserActivityUpdatesShared } from '@/hooks/useGraphQL';

/**
 * Hook for fetching user statistics in admin panel (Source of truth: useGraphQL)
 */
export const useUserStats = () => {
    return useUserStatsShared('admin');
};

/**
 * Hook for user activity updates in admin panel (Source of truth: useGraphQL)
 */
export const useUserActivityUpdates = () => {
    return useUserActivityUpdatesShared('admin');
};
