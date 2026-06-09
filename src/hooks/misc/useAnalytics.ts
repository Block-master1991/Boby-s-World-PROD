import { useAuthContext } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { useCallback, useEffect, useRef } from "react";

interface AnalyticsEvent {
  type: "metric" | "error" | "user_action" | "game_event";
  data: Record<string, unknown>;
}

const useAnalyticsWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    sessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    if (typeof window !== "undefined" && window.Worker) {
      try {
        workerRef.current = new Worker(new URL("../../workers/analytics.worker.ts", import.meta.url));
        workerRef.current.postMessage({
          type: "INIT_ANALYTICS",
          data: { sessionId: sessionIdRef.current },
        });
      } catch (error) {
        logger.warn("[useAnalytics] Failed to initialize analytics worker:", error);
      }
    }
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "DISPOSE" });
        workerRef.current = null;
      }
    };
  }, []);

  return workerRef;
};

export const useAnalytics = () => {
  const { user } = useAuthContext();
  const workerRef = useAnalyticsWorker();

  const trackEvent = useCallback(
    (event: AnalyticsEvent) => {
      workerRef.current?.postMessage({
        type: "ADD_EVENT",
        data: { event: { ...event, userId: user?.publicKey } },
      });
    },
    [user?.publicKey, workerRef]
  );

  const trackPerformance = useCallback(
    (snapshot: { fps: number; memoryUsage: number; drawCalls: number }) => {
      workerRef.current?.postMessage({ type: "RECORD_PERFORMANCE", data: { snapshot } });
    },
    [workerRef]
  );

  const trackError = useCallback(
    (error: Error, context?: Record<string, unknown>) => {
      trackEvent({
        type: "error",
        data: {
          message: error.message,
          stack: error.stack,
          name: error.name,
          context: context ?? {},
        },
      });
    },
    [trackEvent]
  );

  const trackUserAction = useCallback(
    (action: string, data?: Record<string, unknown>) => {
      trackEvent({ type: "user_action", data: { action, ...(data ?? {}) } });
    },
    [trackEvent]
  );

  const trackGameEvent = useCallback(
    (event: string, data?: Record<string, unknown>) => {
      trackEvent({ type: "game_event", data: { event, ...(data ?? {}) } });
    },
    [trackEvent]
  );

  return { trackEvent, trackPerformance, trackError, trackUserAction, trackGameEvent };
};
