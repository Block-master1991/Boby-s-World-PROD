'use client';

import { useApiFetch } from '@/utils/api';
import { useEffect } from 'react';
import { useLoggerFetch, useLoggerState } from './useLoggerDashboardModules';

export const useLoggerDashboard = () => {
    const { apiFetch } = useApiFetch();
    const state = useLoggerState();
    const fetchLogs = useLoggerFetch(state, apiFetch);

    useEffect(() => {
        fetchLogs();
        if (state.autoRefresh) {
            const interval = setInterval(fetchLogs, 5000);
            return () => clearInterval(interval);
        }
        return undefined;
    }, [fetchLogs, state.autoRefresh]);

    return { ...state, fetchLogs };
};
