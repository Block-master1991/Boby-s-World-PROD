"use client";

import { performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthContextType, UserActivity } from "@/types/auth";
import type { ReactNode } from "react";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useAuthCore } from "@/hooks/auth/useAuthCore";
import { useLogout } from "@/hooks/auth/useLogout";
import { usePasskeyAuth } from "@/hooks/auth/usePasskeyAuth";
import { useSolanaAuth } from "@/hooks/auth/useSolanaAuth";
import { useTOTPAuth } from "@/hooks/auth/useTOTPAuth";
import { logger } from "@/lib/logging";

// ─── Activity tracking constants (single source of truth) ─────────────────────
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keypress",
  "scroll",
  "touchstart",
  "click",
  "focus",
  "keydown",
  "visibilitychange",
  "wheel",
] as const;

// Idle thresholds (ms). 15-minute access-token expiry is the hard cap.
const IDLE_THRESHOLD_MS = 12 * 60 * 1000; // mark as idle after 12 minutes
const WARNING_THRESHOLD_MS = 14 * 60 * 1000; // warn after 14 minutes
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // session ends at 15 minutes

// Throttle mousemove — it fires hundreds of times/sec; we only need ~1Hz to
// know the user is "active". This prevents render storms.
const MOUSE_MOVE_THROTTLE_MS = 1000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider — single source of truth for auth + session activity.
 *
 * Listens to user interactions exactly once, derives `userActivity` state,
 * and exposes `isUserActive` / `timeUntilIdle` to consumers. Children should
 * NOT add their own activity listeners — that would double-fire.
 */
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    authState,
    setAuthState,
    checkSession,
    isWalletConnectedAndMatching,
    retrySessionCheck,
    isOnline,
    markTOTPEnabled,
  } = useAuthCore();

  // SSR-safe initial state: the server cannot know the "last active" time,
  // so we mount with a sentinel and hydrate on the client only.
  const [userActivity, setUserActivity] = useState<UserActivity>({
    lastActive: 0,
    isIdle: false,
    idleWarningShown: false,
  });

  // Use refs for time math so the throttled handler always reads the latest
  // timestamp without re-binding on every render.
  const lastEventAtRef = useRef<number>(0);
  const lastThrottledAtRef = useRef<number>(0);
  const idleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClientRef = useRef<boolean>(false);

  // Logout is constructed below; we need a forward reference for the auto-logout
  // timer, so we declare it lazily and assign once `logout` is available.
  const logoutRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // `useLogout` must be defined BEFORE `useActivityTracker` so the
  // `logoutRef` is populated by the time the auto-logout timer can fire.
  const { logout, logoutAndRedirect } = useLogout({
    setAuthState,
    userPublicKey: authState.user?.publicKey,
  });

  // Keep `logoutRef` in sync with the latest `logout` callback.
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const recordUserActivity = useCallback(() => {
    const now = Date.now();
    lastEventAtRef.current = now;

    // Reset warning + idle flags; if we were already not-idle this is cheap.
    setUserActivity(prev => {
      if (!prev.isIdle && !prev.idleWarningShown) {
        // Common case: no flag changes needed. Just bump the timestamp.
        return { ...prev, lastActive: now };
      }
      return { lastActive: now, isIdle: false, idleWarningShown: false };
    });

    // Clear pending timers — user came back before the hard timeout.
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (logoutTimeoutRef.current) {
      clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
  }, []);

  // Install all activity listeners exactly once. See `useActivityTracker`
  // below for the implementation; this keeps the provider function short.
  useActivityTracker({
    recordUserActivity,
    lastEventAtRef,
    lastThrottledAtRef,
    idleCheckIntervalRef,
    warningTimeoutRef,
    logoutTimeoutRef,
    isClientRef,
    logoutRef,
    setUserActivity,
  });

  const { login } = useSolanaAuth({ authState, setAuthState, logoutAndRedirect });
  const { registerPasskey, loginWithPasskey, hasPasskey } = usePasskeyAuth({
    authState,
    setAuthState,
  });
  const { verifyTOTP } = useTOTPAuth({ setAuthState });

  // `timeUntilIdle` is intentionally computed at render time using the latest
  // `lastActive` value. Consumers that need a live ticking countdown should
  // compute it locally (see SessionStatusBar).
  const timeUntilIdle =
    userActivity.lastActive > 0
      ? Math.max(0, SESSION_TIMEOUT_MS - (Date.now() - userActivity.lastActive))
      : SESSION_TIMEOUT_MS;

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    isWalletConnectedAndMatching,
    logoutAndRedirect,
    retrySessionCheck,
    triggerSessionRefresh: checkSession,
    markTOTPEnabled,
    registerPasskey,
    loginWithPasskey,
    verifyTOTP,
    hasPasskey,
    totpEnabled: !!authState.user?.totpEnabled,
    securityLevel:
      hasPasskey || !!authState.user?.totpEnabled
        ? "Maximum"
        : authState.isAuthenticated
          ? "Enhanced"
          : "Standard",
    isOnline,
    performanceStats: performanceMonitor.getPerformanceStats(),
    userActivity,
    recordUserActivity,
    isUserActive: isClientRef.current ? !userActivity.isIdle : true,
    timeUntilIdle,
    lastActive: userActivity.lastActive,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuthContext must be used within an AuthProvider");
  return context;
};

// ─── Internal hook — activity tracking lifecycle ─────────────────────────────

interface ActivityTrackerDeps {
  recordUserActivity: () => void;
  lastEventAtRef: React.MutableRefObject<number>;
  lastThrottledAtRef: React.MutableRefObject<number>;
  idleCheckIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  warningTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  logoutTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isClientRef: React.MutableRefObject<boolean>;
  logoutRef: React.MutableRefObject<() => Promise<void>>;
  setUserActivity: React.Dispatch<React.SetStateAction<UserActivity>>;
}

const IDLE_CHECK_INTERVAL_MS = 60 * 1000;

const useActivityTracker = ({
  recordUserActivity,
  lastEventAtRef,
  lastThrottledAtRef,
  idleCheckIntervalRef,
  warningTimeoutRef,
  logoutTimeoutRef,
  isClientRef,
  logoutRef,
  setUserActivity,
}: ActivityTrackerDeps) => {
  useEffect(() => {
    isClientRef.current = true;
    lastEventAtRef.current = Date.now();
    setUserActivity({ lastActive: Date.now(), isIdle: false, idleWarningShown: false });

    const handleActivity = (e: Event) => {
      // Throttle mousemove only — it fires hundreds of times/sec.
      if (e.type === "mousemove") {
        const now = Date.now();
        if (now - lastThrottledAtRef.current < MOUSE_MOVE_THROTTLE_MS) return;
        lastThrottledAtRef.current = now;
      }
      recordUserActivity();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") recordUserActivity();
    };

    ACTIVITY_EVENTS.forEach(evt => {
      const target = evt === "visibilitychange" ? document : window;
      target.addEventListener(evt, handleActivity, { capture: true, passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibility);

    idleCheckIntervalRef.current = setInterval(() => {
      const inactiveFor = Date.now() - lastEventAtRef.current;
      if (inactiveFor < IDLE_THRESHOLD_MS) return;
      setUserActivity(prev => maybeAdvanceIdle(prev, inactiveFor, logoutRef));
    }, IDLE_CHECK_INTERVAL_MS);

    warningTimeoutRef.current = setTimeout(() => {
      setUserActivity(prev => (prev.isIdle ? { ...prev, idleWarningShown: true } : prev));
    }, WARNING_THRESHOLD_MS);

    logoutTimeoutRef.current = setTimeout(() => {
      logger.warn("[Auth] Inactivity timeout reached. Logging out.");
      logoutRef.current();
    }, SESSION_TIMEOUT_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(evt => {
        const target = evt === "visibilitychange" ? document : window;
        target.removeEventListener(evt, handleActivity, { capture: true } as EventListenerOptions);
      });
      document.removeEventListener("visibilitychange", handleVisibility);
      if (idleCheckIntervalRef.current) clearInterval(idleCheckIntervalRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    };
  }, [
    recordUserActivity,
    lastEventAtRef,
    lastThrottledAtRef,
    idleCheckIntervalRef,
    warningTimeoutRef,
    logoutTimeoutRef,
    isClientRef,
    logoutRef,
    setUserActivity,
  ]);
};

const maybeAdvanceIdle = (
  prev: UserActivity,
  inactiveFor: number,
  logoutRef: React.MutableRefObject<() => Promise<void>>
): UserActivity => {
  if (inactiveFor >= SESSION_TIMEOUT_MS && !prev.idleWarningShown) {
    logger.warn("[Auth] Session timeout reached. Logging out.");
    logoutRef.current();
    return prev;
  }
  const next: UserActivity = { ...prev };
  if (inactiveFor >= IDLE_THRESHOLD_MS) next.isIdle = true;
  if (inactiveFor >= WARNING_THRESHOLD_MS) next.idleWarningShown = true;
  return next;
};
