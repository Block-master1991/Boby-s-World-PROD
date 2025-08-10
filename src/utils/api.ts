import { fetchWithCsrf } from '@/lib/utils';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCallback, useEffect } from 'react';

// Define a type for the fetch function signature
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// This function will be initialized with the triggerSessionRefresh from AuthContext
let globalTriggerSessionRefresh: (() => Promise<boolean>) | null = null;

// Function to set the global triggerSessionRefresh.
// This is a workaround to allow apiFetch (which is not a React hook) to access AuthContext's function.
export const setGlobalTriggerSessionRefresh = (func: () => Promise<boolean>) => {
  globalTriggerSessionRefresh = func;
};

/**
 * A wrapper around fetchWithCsrf that handles 401 authentication errors
 * by attempting to refresh the session and retrying the original request.
 * It relies on a globally set triggerSessionRefresh function from AuthContext.
 */
export const apiFetch: FetchFunction = async (input, init) => {
  const MAX_RETRIES = 1; // Only one retry after token refresh
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
            retries++;
            // If refresh was successful, retry the request.
            // We need to clone the request if it's a Request object, as it can only be consumed once.
            const retryInput = input instanceof Request ? input.clone() : input;
            return await fetchWithCsrf(retryInput, init);
          } else {
            console.error('[apiFetch] Session refresh failed. Not retrying.');
            // If refresh failed, return the original 401 response
            return response;
          }
        } else {
          console.error('[apiFetch] globalTriggerSessionRefresh not set. Cannot refresh session.');
          return response; // Return original 401 if no refresh mechanism is available
        }
      }
      return response; // Return response if not 401 or if 401 after retry
    } catch (error) {
      console.error('[apiFetch] Error during fetch:', error);
      throw error; // Re-throw other errors
    }
  }
  // Should ideally not reach here if MAX_RETRIES is 1 and logic is sound
  throw new Error('apiFetch: Max retries exceeded or unexpected error.');
};

/**
 * Custom hook to provide the apiFetch function, ensuring it has access
 * to the triggerSessionRefresh from AuthContext.
 */
export const useApiFetch = () => {
  const { triggerSessionRefresh } = useAuthContext();

  // Set the global triggerSessionRefresh when the component mounts or triggerSessionRefresh changes
  // This ensures apiFetch has access to the latest function from the context
  // Use useEffect for side effects, not useCallback
  useEffect(() => {
    setGlobalTriggerSessionRefresh(triggerSessionRefresh);
  }, [triggerSessionRefresh]); // Dependency array ensures it updates if triggerSessionRefresh changes

  return { apiFetch };
};
