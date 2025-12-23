import { useEffect, useRef, useCallback } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

interface AnalyticsEvent {
    type: 'metric' | 'error' | 'user_action' | 'game_event';
    data: any;
}

export const useAnalytics = () => {
    const { user } = useAuthContext();
    const workerRef = useRef<Worker | null>(null);
    const sessionIdRef = useRef<string>('');

    useEffect(() => {
        // Generate session ID
        sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Initialize analytics worker
        if (typeof window !== 'undefined' && window.Worker) {
            try {
                workerRef.current = new Worker(new URL('../workers/analytics.worker.ts', import.meta.url));
                workerRef.current.postMessage({ type: 'INIT_ANALYTICS', data: { sessionId: sessionIdRef.current } });
            } catch (error) {
                console.warn('[useAnalytics] Failed to initialize analytics worker:', error);
            }
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'DISPOSE' });
                workerRef.current = null;
            }
        };
    }, []);

    const trackEvent = useCallback((event: AnalyticsEvent) => {
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'ADD_EVENT',
                data: {
                    event: {
                        ...event,
                        userId: user?.publicKey,
                    }
                }
            });
        }
    }, [user?.publicKey]);

    const trackPerformance = useCallback((snapshot: {
        fps: number;
        memoryUsage: number;
        drawCalls: number;
    }) => {
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'RECORD_PERFORMANCE',
                data: { snapshot }
            });
        }
    }, []);

    const trackError = useCallback((error: Error, context?: any) => {
        trackEvent({
            type: 'error',
            data: {
                message: error.message,
                stack: error.stack,
                name: error.name,
                context,
            }
        });
    }, [trackEvent]);

    const trackUserAction = useCallback((action: string, data?: any) => {
        trackEvent({
            type: 'user_action',
            data: { action, ...data }
        });
    }, [trackEvent]);

    const trackGameEvent = useCallback((event: string, data?: any) => {
        trackEvent({
            type: 'game_event',
            data: { event, ...data }
        });
    }, [trackEvent]);

    return {
        trackEvent,
        trackPerformance,
        trackError,
        trackUserAction,
        trackGameEvent,
    };
};
