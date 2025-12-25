/**
 * Admin-specific hooks that don't depend on urql/graphql-client
 * These are safer for admin panel usage
 */

import { useState, useCallback, useEffect } from 'react';
import { useApiFetch } from '@/utils/api';

/**
 * Hook for fetching user statistics in admin panel
 */
export const useUserStats = () => {
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const execute = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await apiFetch('/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `
                        query GetUserStats {
                            userStats {
                                totalUsers
                                onlineUsers
                                offlineUsers
                                activeGames
                            }
                        }
                    `,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(result.errors[0].message);
            }

            setData(result.data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('[useUserStats] Error:', errorMessage);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [apiFetch]);

    // Auto-execute on mount
    useEffect(() => {
        execute();
    }, [execute]);

    return {
        data,
        loading,
        error,
        execute,
    };
};

/**
 * Hook for user activity updates in admin panel
 */
export const useUserActivityUpdates = () => {
    const { apiFetch } = useApiFetch();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isSubscribed = true;

        const subscribeToActivityUpdates = async () => {
            try {
                // Check if user is authenticated (has CSRF token)
                const hasCsrfToken = typeof document !== 'undefined' && document.cookie.includes('csrfToken');
                if (!hasCsrfToken) {
                    console.log('[useUserActivityUpdates] No CSRF token found, user likely logged out. Stopping activity updates.');
                    return;
                }

                // Polling implementation (would be WebSocket in production)
                const pollActivity = async () => {
                    try {
                        // Check CSRF token before each request
                        const currentHasCsrfToken = typeof document !== 'undefined' && document.cookie.includes('csrfToken');
                        if (!currentHasCsrfToken) {
                            console.log('[useUserActivityUpdates] CSRF token lost during polling, stopping activity updates.');
                            return;
                        }

                        const response = await apiFetch('/api/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                query: `
                                    query UserActivityUpdates {
                                        userActivityUpdates @client {
                                            onlineUsers
                                            activeGames
                                            timestamp
                                        }
                                    }
                                `,
                            }),
                        });

                        if (response.ok && isSubscribed) {
                            const result = await response.json();
                            if (result.data?.userActivityUpdates) {
                                setData(result.data.userActivityUpdates);
                                setError(null);
                            }
                        }
                    } catch (err) {
                        if (isSubscribed) {
                            // تحسين error handling للـ network errors
                            if (err instanceof Error &&
                                (err.message?.includes('NetworkError') ||
                                    err.message?.includes('Failed to fetch') ||
                                    err.message?.includes('fetch resource'))) {
                                // Network error - لا نعرض خطأ للمستخدم، فقط نسجل
                                console.warn('[useUserActivityUpdates] Network error (will retry):', err.message);
                                setError(null); // Clear error to avoid showing to user
                            } else {
                                const errorMessage = err instanceof Error ? err.message : 'Activity subscription error';
                                setError(errorMessage);
                                console.error('[useUserActivityUpdates] Error:', errorMessage);
                            }
                        }
                    }
                };

                // Poll every 10 seconds (matching server interval)
                const intervalId = setInterval(pollActivity, 10000);

                // Initial poll
                pollActivity();

                return () => {
                    clearInterval(intervalId);
                };
            } catch (err) {
                if (isSubscribed) {
                    const errorMessage = err instanceof Error ? err.message : 'Failed to setup activity subscription';
                    setError(errorMessage);
                    console.error('[useUserActivityUpdates] Setup error:', errorMessage);
                }
            }
        };

        subscribeToActivityUpdates();

        return () => {
            isSubscribed = false;
        };
    }, [apiFetch]);

    return {
        data,
        error,
    };
};
