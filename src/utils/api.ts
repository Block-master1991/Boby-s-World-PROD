import { fetchWithCsrf } from '@/lib/utils';
import { initializeConnectionPooling, pooledFetch } from '@/lib/connection-pool';
import { swrBackgroundSync } from '@/lib/swr-config';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

// Define a type for the fetch function signature
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// This function will be initialized with the triggerSessionRefresh from AuthContext
let globalTriggerSessionRefresh: (() => Promise<boolean>) | null = null;
let globalToast: ReturnType<typeof useToast>['toast'] | null = null; // For global toast access

// Function to set the global triggerSessionRefresh.
export const setGlobalTriggerSessionRefresh = (func: () => Promise<boolean>) => {
  globalTriggerSessionRefresh = func;
};

// Function to set the global toast function.
export const setGlobalToast = (func: ReturnType<typeof useToast>['toast']) => {
  if (typeof func === 'function') {
    globalToast = func;
  }
};

// ===== Response Caching =====
// Caching has been completely disabled

// ===== General Settings =====
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 60000; // 60 seconds (increased for mobile/dev)

// ===== Request Deduplication =====
// Map to track active requests and prevent race conditions
const activeRequests = new Map<string, Promise<Response>>();
const REQUEST_DEDUP_TTL = 5000; // 5 seconds TTL for deduplication

// Generate a deduplication key from request details
function generateRequestKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.stringify(init.body) : '';

  // Create a hash of the request for deduplication
  return `${method}:${url}:${body}`.slice(0, 200); // Limit key length
}

// Clean up expired deduplication entries
setInterval(() => {
  // This is a simple cleanup - in production you might want more sophisticated tracking
  activeRequests.clear();
}, REQUEST_DEDUP_TTL);

// ===== Helper Functions =====

// Delay (for use with retry)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import { logger } from '@/utils/logger';

// Show error message to user
const showErrorToast = (title: string, description: string) => {
  if (globalToast) {
    globalToast({ title, description, variant: "destructive" });
  }
};

// Validate response
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

// Handle 401 (session expired)
const handle401Error = async (): Promise<boolean> => {
  logger.warn("[apiFetch] 401 Unauthorized. Trying session refresh...");
  if (globalTriggerSessionRefresh) {
    const ok = await globalTriggerSessionRefresh();
    if (ok) {
      logger.log("[apiFetch] Session refreshed successfully.");
      return true;
    }
    logger.error("[apiFetch] Session refresh failed.");
    showErrorToast("Session Expired", "Failed to refresh session. Please log in again.");
  } else {
    logger.error("[apiFetch] globalTriggerSessionRefresh not set.");
    showErrorToast("System Error", "An error occurred in the system. Please refresh the page.");
  }
  return false;
};

// Handle 403 (CSRF)
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

/**
 * A wrapper around fetchWithCsrf that handles 401 authentication errors
 * by attempting to refresh the session and retrying the original request.
 * It relies on a globally set triggerSessionRefresh function from AuthContext.
 */
export const apiFetch: FetchFunction = async (input, init) => {
  const url = typeof input === "string" ? input : input.toString();
  const requestKey = generateRequestKey(input, init);

  // Check for duplicate request and return the existing promise if found
  // Skip deduplication for high-frequency game events like adding coins
  const isHighFrequencyEvent = url.includes('/api/game/addCoin');
  const existingRequest = isHighFrequencyEvent ? null : activeRequests.get(requestKey);

  if (existingRequest) {
    logger.log(`[apiFetch] Deduplicating request to: ${url}`);
    const res = await existingRequest;
    return res.clone();
  }

  let retries = 0;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      logger.log(`Making request to: ${url}`);
      const response = await fetchWithCsrf(input, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      // Handle 401
      if (response.status === 401) {
        logger.warn(`Received 401 for: ${url}`);
        if (await handle401Error()) {
          logger.log(`Retrying after session refresh: ${url}`);
          return attemptFetch();
        }
        return response;
      }

      // Handle 403
      // Handle 403
      if (response.status === 403) {
        logger.warn(`Received 403 for: ${url}`);
        // Only try refresh once
        if (!init?.headers || !(init.headers as any)['X-CSRF-Retry']) {
          if (await handle403Error()) {
            logger.log(`Retrying after CSRF refresh: ${url}`);
            // Add header to prevent infinite loop
            const newHeaders = { ...(init?.headers || {}), 'X-CSRF-Retry': '1' };
            return apiFetch(input, { ...init, headers: newHeaders });
          }
        }
        return response;
      }

      // Handle server errors 5xx
      if (response.status >= 500 && response.status < 600) {
        if (retries < MAX_RETRIES) {
          logger.warn(`Server error ${response.status} for: ${url}. Retry ${retries + 1}/${MAX_RETRIES}`);
          retries++;
          await delay(RETRY_DELAY_MS);
          return attemptFetch();
        }
        logger.error(`Max retries reached for server error: ${url}`);
        // Queue for background retry
        swrBackgroundSync.addToSyncQueue(url);
      }

      // Validate response
      const validRes = await validateResponse(response);

      // Caching has been completely disabled
      // No data is cached at all

      return validRes;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          logger.error(`Request aborted due to timeout: ${url}`);
          showErrorToast("Request Timeout", "The request took too long. Please try again.");
          throw new Error("Request timeout");
        }

        // Enhanced error handling for network errors with retry
        if (error.message?.includes('NetworkError') ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('fetch resource')) {

          if (retries < MAX_RETRIES) {
            logger.warn(`Network error for ${url}. Retry ${retries + 1}/${MAX_RETRIES}: ${error.message}`);
            retries++;
            await delay(RETRY_DELAY_MS);
            return attemptFetch();
          }

          logger.error(`Max retries reached for network error: ${url}`, error.message);

          // Don't show toast for network errors as they may be temporary
          // and hooks will handle them better

          // Re-throw the error as is
          throw error;
        }

        logger.error(`Fetch error for ${url}:`, error.message);
        throw error;
      } else {
        logger.error(`Unknown error for ${url}:`, error);
        throw new Error("An unknown error occurred");
      }
    }
  };

  // Create the request promise and store it for deduplication
  const requestPromise = (async () => {
    try {
      const result = await attemptFetch();
      return result;
    } catch (error) {
      // If it's a network error, re-throw for caller to handle
      if (error instanceof Error &&
        (error.message?.includes('NetworkError') ||
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('fetch resource'))) {
        throw error;
      }

      // For other errors, show toast and re-throw
      showErrorToast("Request Error", "An error occurred while processing the request. Please try again.");
      throw error;
    } finally {
      // Clean up the deduplication entry after request completes
      activeRequests.delete(requestKey);
    }
  })();

  // Store the promise for deduplication
  activeRequests.set(requestKey, requestPromise);

  return requestPromise;
};

/**
 * Custom hook to provide the apiFetch function, ensuring it has access
 * to the triggerSessionRefresh from AuthContext.
 */
export const useApiFetch = () => {
  const { triggerSessionRefresh } = useAuthContext();
  const { toast } = useToast();

  // Set the global functions when the component mounts or dependencies change
  useEffect(() => {
    initializeConnectionPooling();
    setGlobalTriggerSessionRefresh(triggerSessionRefresh);
    setGlobalToast(toast);
  }, [triggerSessionRefresh, toast]); // Dependency array ensures it updates if functions change

  const memoizedApiFetch = useCallback<FetchFunction>(async (input, init) => {
    return apiFetch(input, init);
  }, []);

  return { apiFetch: memoizedApiFetch };
};
