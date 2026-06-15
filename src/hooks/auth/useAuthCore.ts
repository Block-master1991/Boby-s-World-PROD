import { cacheManager, performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthState } from "@/types/auth";
import { logger } from "@/utils/logger";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Module-level Guard ───────────────────────────────────────────────────────
// Prevents multiple initial session checks (survives React Strict Mode)
let initialSessionCheckStarted = false;

// ─── Types ────────────────────────────────────────────────────────────────────
interface SessionCheckRefs {
  inProgress: React.MutableRefObject<boolean>;
  isAuthenticated: React.MutableRefObject<boolean>;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

const fetchSessionData = () => {
  const url = `/api/auth/session?t=${Date.now()}`;
  const req = new Request(url, { method: "GET", credentials: "include", cache: "no-store" });
  return (
    cacheManager.handleRequest(req) || fetch(url, { credentials: "include", cache: "no-store" })
  );
};

const handleAuthSuccess = (
  wallet: string,
  data: { user?: { totpEnabled?: boolean; authMethod?: string } },
  refs: SessionCheckRefs,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
) => {
  performanceMonitor.recordCacheHit();
  refs.isAuthenticated.current = true;

  // Check if user has a passkey registered on this device
  const hasPasskey =
    typeof window !== "undefined" &&
    localStorage.getItem("boby_world_passkey_registered") === "true";
  const totpEnabled = !!data.user?.totpEnabled;
  const currentAuthMethod = data.user?.authMethod;

  // Session is locked if:
  // 1. Passkey is registered but NOT used in current session
  // 2. TOTP is enabled but NOT used in current session
  const isLocked =
    (hasPasskey || totpEnabled) &&
    currentAuthMethod !== "passkey" &&
    currentAuthMethod !== "biometric" &&
    currentAuthMethod !== "totp" &&
    currentAuthMethod !== "mfa";

  setAuthState({
    isAuthenticated: true,
    user: {
      publicKey: wallet,
      wallet,
      authMethod: currentAuthMethod,
      totpEnabled,
    },
    isLoading: false,
    error: null,
    isLocked,
    authMethod: currentAuthMethod,
  });
  localStorage.setItem("last_user_pk", wallet);
};

const handleAuthFailure = (
  refs: SessionCheckRefs,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
  error?: string
) => {
  refs.isAuthenticated.current = false;
  if (error) performanceMonitor.recordError();
  setAuthState({
    isAuthenticated: false,
    user: null,
    isLoading: false,
    error: error ?? null,
    isLocked: false,
  });
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const hOn = () => setIsOnline(true);
    const hOff = () => setIsOnline(false);
    window.addEventListener("online", hOn);
    window.addEventListener("offline", hOff);
    return () => {
      window.removeEventListener("online", hOn);
      window.removeEventListener("offline", hOff);
    };
  }, []);

  return isOnline;
};

// Polling cadence (in ms). Long enough to avoid noisy traffic,
// short enough to catch a freshly-rotated refresh token.
const SESSION_POLL_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes

const useSessionPoller = (
  checkSessionRef: React.MutableRefObject<() => Promise<boolean>>,
  hasInitialized: React.MutableRefObject<boolean>
) => {
  // Initial check — runs once on mount regardless of auth state.
  useEffect(() => {
    if (hasInitialized.current || initialSessionCheckStarted) return;
    hasInitialized.current = true;
    initialSessionCheckStarted = true;
    checkSessionRef.current();
  }, [checkSessionRef, hasInitialized]);

  // Recurring poll — only while authenticated to avoid noisy 401s after logout.
  // Activity tracking and idle-detection are handled centrally in AuthContext
  // (single source of truth) and exposed via `isUserActive`. Keeping a second
  // poller here would double-fire listeners and skew idle timers.
  useEffect(() => {
    const interval = setInterval(() => {
      checkSessionRef.current();
    }, SESSION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkSessionRef]);
};

const useSessionCheck = (
  refs: SessionCheckRefs,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
  setRetryRequested: React.Dispatch<React.SetStateAction<boolean>>
) => {
  return useCallback(async (): Promise<boolean> => {
    if (refs.inProgress.current) return refs.isAuthenticated.current;
    refs.inProgress.current = true;

    try {
      if (!refs.isAuthenticated.current)
        setAuthState(p => ({ ...p, isLoading: true, error: null }));
      const start = Date.now();

      try {
        const res = await fetchSessionData();
        if (res?.ok) {
          const data = await res.json();
          if (data.authenticated && data.user?.wallet) {
            handleAuthSuccess(data.user.wallet, data, refs, setAuthState);
            return true;
          }
        } else if (res?.status === 401 || res?.status === 403) {
          // FORCE LOGOUT: If we were authenticated and now we get 401/403, we must clear state.
          if (refs.isAuthenticated.current) {
            logger.warn("[AuthCore] Session expired or unauthorized. Clearing state.");
            handleAuthFailure(refs, setAuthState);
            // The AuthProvider will detect this change and can redirect if needed.
            return false;
          }
        }
        handleAuthFailure(refs, setAuthState);
        return false;
      } catch {
        handleAuthFailure(refs, setAuthState, "Network Error");
        return false;
      } finally {
        performanceMonitor.recordLoadTime(Date.now() - start);
      }
    } finally {
      refs.inProgress.current = false;
      setRetryRequested(false);
    }
  }, [refs, setAuthState, setRetryRequested]);
};

// ─── Main Hook ────────────────────────────────────────────────────────────────

const useRateLimitCountdown = (
  rateLimitUntil: number | null | undefined,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>
) => {
  useEffect(() => {
    if (!rateLimitUntil) return;
    const interval = setInterval(() => {
      const remaining = rateLimitUntil ? rateLimitUntil - Date.now() : 0;
      if (remaining <= 0) {
        setAuthState(p => ({
          ...p,
          rateLimitUntil: null,
          retryAfter: null,
          error: p.error?.includes("Too many login attempts") ? null : p.error,
        }));
        clearInterval(interval);
      } else {
        setAuthState(p => ({
          ...p,
          retryAfter: Math.ceil(remaining / 1000),
        }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitUntil, setAuthState]);
};

export const useAuthCore = () => {
  const { publicKey: adapterPublicKey, connected } = useWallet();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
    isLocked: false,
  });
  const [retryRequested, setRetryRequested] = useState(false);
  const isOnline = useOnlineStatus();

  const refs: SessionCheckRefs = { inProgress: useRef(false), isAuthenticated: useRef(false) };
  const hasInitialized = useRef(false);

  const checkSession = useSessionCheck(refs, setAuthState, setRetryRequested);
  const checkSessionRef = useRef(checkSession);
  checkSessionRef.current = checkSession;

  const isWalletConnectedAndMatching = useMemo(
    () =>
      !!connected &&
      !!adapterPublicKey &&
      authState.user?.publicKey === adapterPublicKey.toBase58(),
    [connected, adapterPublicKey, authState.user?.publicKey]
  );

  // Directly patches auth state after TOTP enable — avoids cache race condition
  const markTOTPEnabled = useCallback(() => {
    setAuthState(prev => {
      if (!prev.user) return prev;
      return {
        ...prev,
        isLocked: false,
        authMethod: "totp",
        user: {
          ...prev.user,
          totpEnabled: true,
          authMethod: "totp",
        },
      };
    });
    refs.isAuthenticated.current = true;
  }, [refs]);

  useSessionPoller(checkSessionRef, hasInitialized);
  useEffect(() => {
    if (retryRequested) checkSession();
  }, [retryRequested, checkSession]);

  useRateLimitCountdown(authState.rateLimitUntil, setAuthState);

  return {
    authState,
    setAuthState,
    checkSession,
    isOnline,
    retrySessionCheck: () => setRetryRequested(true),
    isWalletConnectedAndMatching,
    markTOTPEnabled,
  };
};
