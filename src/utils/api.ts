import { fetchWithCsrf } from '@/lib/utils';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast'; // Import useToast

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
  globalToast = func;
};

/**
 * A wrapper around fetchWithCsrf that handles 401 authentication errors
 * by attempting to refresh the session and retrying the original request.
 * It relies on a globally set triggerSessionRefresh function from AuthContext.
 */
export const apiFetch: FetchFunction = async (input, init) => {
  const MAX_RETRIES = 2; // Allow up to 2 retries for 503 errors
  const RETRY_DELAY_MS = 1000; // 1 second delay before retrying
  let retries = 0;

  while (retries <= MAX_RETRIES) {
    try {
      const response = await fetchWithCsrf(input, init);

      if (response.status === 401) {
        console.warn('[apiFetch] Received 401. Attempting to refresh session...');
        if (globalTriggerSessionRefresh) {
          const refreshSuccess = await globalTriggerSessionRefresh();
          if (refreshSuccess) {
            console.log('[apiFetch] Session refreshed successfully. Retrying original request.');
            retries++; // Increment retries for the 401 retry attempt
            const retryInput = input instanceof Request ? input.clone() : input;
            return await fetchWithCsrf(retryInput, init);
          } else {
            console.error('[apiFetch] Session refresh failed. Not retrying.');
            return response;
          }
        } else {
          console.error('[apiFetch] globalTriggerSessionRefresh not set. Cannot refresh session.');
          return response;
        }
      } else if (response.status === 403) {
        console.warn('[apiFetch] Received 403 Forbidden. Attempting to refresh CSRF token...');
        try {
          const csrfResponse = await fetch('/api/auth/refresh-csrf', { method: 'POST' });
          if (csrfResponse.ok) {
            console.log('[apiFetch] CSRF token refreshed successfully. Retrying original request.');
            retries++; // Use a retry attempt for CSRF refresh
            const retryInput = input instanceof Request ? input.clone() : input;
            return await fetchWithCsrf(retryInput, init);
          } else {
            console.error('[apiFetch] Failed to refresh CSRF token, server responded with:', await csrfResponse.text());
            if (globalToast) {
              globalToast({
                title: 'خطأ في المزامنة',
                description: 'لم نتمكن من تحديث جلستك. يرجى تحديث الصفحة والمحاولة مرة أخرى.',
                variant: 'destructive',
              });
            }
            return response; // Return original 403 response if CSRF refresh fails
          }
        } catch (e) {
          console.error('[apiFetch] Error during CSRF token refresh request:', e);
          if (globalToast) {
            globalToast({
              title: 'خطأ في الشبكة',
              description: 'فشل الاتصال بالخادم لتحديث الجلسة. يرجى التحقق من اتصالك بالإنترنت.',
              variant: 'destructive',
            });
          }
          return response; // Return original 403 response on network error
        }
      } else if (response.status >= 500 && response.status < 600) {
        console.warn(`[apiFetch] Received ${response.status} (Server Error). Retrying...`);
        retries++;
        if (retries <= MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          // Clone the request for retry
          const retryInput = input instanceof Request ? input.clone() : input;
          continue; // Continue to the next iteration of the loop to retry
        } else {
          console.error(`[apiFetch] Max retries exceeded for ${response.status} error.`);
          return response; // Return the last 5xx response if max retries exceeded
        }
      }

      // Check if the response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response; // Return response if it's JSON and not a 401/5xx error
      } else {
        // If not JSON, read as text and throw a custom error
        const text = await response.text();
        console.error(`[apiFetch] Non-JSON response received from ${input}:`, text);
        const error = new Error(`Non-JSON response or unexpected content type: ${contentType || 'none'}. Status: ${response.status}. Response body: ${text.substring(0, 200)}...`);
        (error as any).response = response; // Attach the original response for more context
        throw error;
      }
    } catch (error) {
      console.error('[apiFetch] Error during fetch:', error);
      throw error; // Re-throw other errors (e.g., network errors)
    }
  }
  // This part should ideally not be reached if MAX_RETRIES is handled correctly within the loop
  throw new Error('apiFetch: Unexpected error or max retries exceeded without a final response.');
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
    setGlobalTriggerSessionRefresh(triggerSessionRefresh);
    setGlobalToast(toast);
  }, [triggerSessionRefresh, toast]); // Dependency array ensures it updates if functions change

  return { apiFetch };
};
