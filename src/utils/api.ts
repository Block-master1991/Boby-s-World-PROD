import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/ui/use-toast";
import { initializeConnectionPooling } from "@/lib/connection-pool";
import { swrBackgroundSync } from "@/lib/swr/swr-config";
import { fetchWithCsrf } from "@/lib/utils";
import { logger } from "@/utils/logger";
import { useCallback, useEffect } from "react";

// --- Type Definitions ---

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// --- Constants & Global State ---

let globalTriggerSessionRefresh: (() => Promise<boolean>) | null = null;
let globalToast: ReturnType<typeof useToast>["toast"] | null = null;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000;

// Paths that should advertise themselves as live gameplay to the auth
// middleware. Matches any path under `/api/game/...` except admin/graphql
// (which are not "in-progress" gameplay).
const ACTIVE_GAME_PATH_PREFIX = "/api/game/";

const isActiveGamePath = (url: string): boolean =>
  url.includes(ACTIVE_GAME_PATH_PREFIX) && !url.includes("/api/game/admin");

const activeRequests = new Map<string, Promise<Response>>();

// --- Helper Functions ---

export const setGlobalTriggerSessionRefresh = (func: () => Promise<boolean>) => {
  globalTriggerSessionRefresh = func;
};

export const setGlobalToast = (func: ReturnType<typeof useToast>["toast"]) => {
  if (typeof func === "function") {
    globalToast = func;
  }
};

const showErrorToast = (title: string, description: string) => {
  if (globalToast) {
    globalToast({ title, description, variant: "destructive" });
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function generateRequestKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method || "GET";
  const body = init?.body ? JSON.stringify(init.body) : "";
  return `${method}:${url}:${body}`.slice(0, 200);
}

// NOTE: We intentionally do NOT use a setInterval to clear activeRequests.
// Each request promise removes its own key in the finally block below.
// A periodic clear() would remove in-flight entries and allow duplicate
// requests to be fired concurrently (different batchId → idempotency bypass).

const validateResponse = async (response: Response): Promise<Response> => {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response;
  }

  const text = await response.text();
  logger.error("[apiFetch] Non-JSON response received:", text);

  const error = new Error(
    `Unexpected response type: ${contentType || "none"} (status ${response.status}). Body: ${text.slice(0, 200)}...`
  );
  (error as Error & { response?: Response }).response = response;
  throw error;
};

// --- Error Handlers ---

const handle401Error = async (): Promise<boolean> => {
  logger.warn("[apiFetch] 401 Unauthorized. Trying session refresh...");
  if (globalTriggerSessionRefresh) {
    const ok = await globalTriggerSessionRefresh();
    if (ok) {
      logger.log("[apiFetch] Session refreshed successfully.");
      return true;
    }
    logger.warn("[apiFetch] Session refresh failed (expected after logout).");
    showErrorToast("Session Expired", "Failed to refresh session. Please log in again.");
  } else {
    logger.error("[apiFetch] globalTriggerSessionRefresh not set.");
    showErrorToast("System Error", "An error occurred in the system. Please refresh the page.");
  }
  return false;
};

const handle403Error = async (): Promise<boolean> => {
  logger.warn("[apiFetch] 403 Forbidden. Trying CSRF refresh...");
  try {
    const csrfRes = await fetch("/api/auth/refresh-csrf", { method: "POST" });
    if (csrfRes.ok) {
      logger.log("[apiFetch] CSRF token refreshed successfully.");
      return true;
    }
    logger.error("[apiFetch] Failed to refresh CSRF token.");
    showErrorToast("Sync Error", "Failed to refresh session. Please reload the page.");
  } catch (e) {
    logger.error("[apiFetch] CSRF refresh request failed:", e);
    showErrorToast("Network Error", "Failed to connect to server. Check your internet connection.");
  }
  return false;
};

// --- Status & Error Processing ---

const handleResponseStatus = async (
  response: Response,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  retryState: { count: number; attemptFetch: () => Promise<Response> }
): Promise<Response | null> => {
  const url = typeof input === "string" ? input : input.toString();

  if (response.status === 401) {
    logger.warn(`Received 401 for: ${url}`);
    // TOTP verification failures should NOT trigger session refresh.
    // A 401 from TOTP check means the code was invalid/expired, not that the session expired.
    const isTOTPVerificationFailure = url.includes("/api/auth/totp/");
    if (!isTOTPVerificationFailure) {
      if (await handle401Error()) {
        logger.log(`Retrying after session refresh: ${url}`);
        return retryState.attemptFetch();
      }
    }
    return response;
  }

  if (response.status === 403) {
    logger.warn(`Received 403 for: ${url}`);
    const headers = (init?.headers || {}) as Record<string, string>;
    if (!headers["X-CSRF-Retry"]) {
      if (await handle403Error()) {
        logger.log(`Retrying after CSRF refresh: ${url}`);
        const newHeaders = { ...headers, "X-CSRF-Retry": "1" };
        return apiFetch(input, { ...init, headers: newHeaders });
      }
    }
    return response;
  }

  if (response.status >= 500 && response.status < 600) {
    if (retryState.count < MAX_RETRIES) {
      logger.warn(
        `Server error ${response.status} for: ${url}. Retry ${retryState.count + 1}/${MAX_RETRIES}`
      );
      retryState.count++;
      await delay(RETRY_DELAY_MS);
      return retryState.attemptFetch();
    }
    logger.error(`Max retries reached for server error: ${url}`);
    swrBackgroundSync.addToSyncQueue(url);
  }

  return null;
};

const handleFetchError = async (
  error: unknown,
  url: string,
  retryState: { count: number; attemptFetch: () => Promise<Response> }
): Promise<Response> => {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      logger.error(`Request aborted due to timeout: ${url}`);
      showErrorToast("Request Timeout", "The request took too long. Please try again.");
      throw new Error("Request timeout");
    }

    const isNetworkError =
      error.message?.includes("NetworkError") ||
      error.message?.includes("Failed to fetch") ||
      error.message?.includes("fetch resource");

    if (isNetworkError && retryState.count < MAX_RETRIES) {
      logger.warn(
        `Network error for ${url}. Retry ${retryState.count + 1}/${MAX_RETRIES}: ${error.message}`
      );
      retryState.count++;
      await delay(RETRY_DELAY_MS);
      return retryState.attemptFetch();
    }

    if (isNetworkError)
      logger.error(`Max retries reached for network error: ${url}`, error.message);
    else logger.error(`Fetch error for ${url}:`, error.message);

    throw error;
  }
  logger.error(`Unknown error for ${url}:`, error);
  throw new Error("An unknown error occurred");
};

// --- Execution Logic ---

export const apiFetch: FetchFunction = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  const requestKey = generateRequestKey(input, init);

  const isHighFreq = url.includes("/api/game/addCoin");
  const existingRequest = isHighFreq ? null : activeRequests.get(requestKey);

  if (existingRequest) {
    logger.log(`[apiFetch] Deduplicating request to: ${url}`);
    const res = await existingRequest;
    return res.clone();
  }

  const rs = { count: 0, attemptFetch: () => Promise.resolve(new Response()) };

  // Mark game requests as "active gameplay" so the server doesn't kick the
  // user out on transient nonce/timing races. We only add the header when it
  // is absent — callers can override (e.g. tests) by setting it explicitly.
  const isActiveGame = isActiveGamePath(url);
  const baseHeaders = (init?.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = isActiveGame
    ? { ...baseHeaders, "X-Active-Game": baseHeaders["X-Active-Game"] || "1" }
    : baseHeaders;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchWithCsrf(input, { ...init, headers, signal: controller.signal });
      clearTimeout(tId);
      const statusRes = await handleResponseStatus(res, input, { ...init, headers }, rs);
      if (statusRes) return statusRes;
      return validateResponse(res);
    } catch (e) {
      clearTimeout(tId);
      return handleFetchError(e, url, rs);
    }
  };

  rs.attemptFetch = attemptFetch;
  const requestPromise = (async () => {
    try {
      return await attemptFetch();
    } catch (e) {
      const isNet =
        e instanceof Error &&
        (e.message?.includes("NetworkError") || e.message?.includes("Failed to fetch"));
      if (!isNet) showErrorToast("Request Error", "An error occurred. Please try again.");
      throw e;
    } finally {
      activeRequests.delete(requestKey);
    }
  })();

  activeRequests.set(requestKey, requestPromise);
  return requestPromise;
};

// --- React Hook ---

export const useApiFetch = () => {
  const { triggerSessionRefresh } = useAuthContext();
  const { toast } = useToast();

  useEffect(() => {
    initializeConnectionPooling();
    setGlobalTriggerSessionRefresh(triggerSessionRefresh);
    setGlobalToast(toast);
  }, [triggerSessionRefresh, toast]);

  const memoizedApiFetch = useCallback<FetchFunction>((input, init) => apiFetch(input, init), []);

  return { apiFetch: memoizedApiFetch };
};
