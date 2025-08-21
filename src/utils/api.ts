import { fetchWithCsrf } from '@/lib/utils';
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

// ===== التخزين المؤقت للاستجابات =====
// تم إلغاء التخزين المؤقت بالكامل

// ===== إعدادات عامة =====
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 30000; // 30 ثانية

// ===== دوال مساعدة =====

// تأخير (للاستخدام مع إعادة المحاولة)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// عرض رسالة خطأ للمستخدم
const showErrorToast = (title: string, description: string) => {
  if (globalToast) {
    globalToast({ title, description, variant: "destructive" });
  }
};

// التحقق من صحة الاستجابة
const validateResponse = async (response: Response): Promise<Response> => {
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response;
  }

  const text = await response.text();
  console.error("[apiFetch] Non-JSON response received:", text);

  const error = new Error(
    `Unexpected response type: ${contentType || "none"} (status ${response.status}). Body: ${text.slice(0, 200)}...`
  );
  (error as Error & { response?: Response }).response = response;
  throw error;
};

// معالجة 401 (انتهاء الجلسة)
const handle401Error = async (): Promise<boolean> => {
  console.warn("[apiFetch] 401 Unauthorized. Trying session refresh...");
  if (globalTriggerSessionRefresh) {
    const ok = await globalTriggerSessionRefresh();
    if (ok) {
      console.log("[apiFetch] Session refreshed successfully.");
      return true;
    }
    console.error("[apiFetch] Session refresh failed.");
    showErrorToast("انتهت الجلسة", "تعذّر تجديد الجلسة. يرجى تسجيل الدخول مرة أخرى.");
  } else {
    console.error("[apiFetch] globalTriggerSessionRefresh not set.");
    showErrorToast("خطأ في النظام", "حدث خطأ في النظام. يرجى تحديث الصفحة.");
  }
  return false;
};

// معالجة 403 (CSRF)
const handle403Error = async (): Promise<boolean> => {
  console.warn("[apiFetch] 403 Forbidden. Trying CSRF refresh...");
  try {
    const csrfRes = await fetch("/api/auth/refresh-csrf", { method: "POST" });
    if (csrfRes.ok) {
      console.log("[apiFetch] CSRF token refreshed successfully.");
      return true;
    }
    console.error("[apiFetch] Failed to refresh CSRF token.");
    showErrorToast("خطأ في المزامنة", "تعذّر تحديث الجلسة. رجاءً أعد تحميل الصفحة.");
  } catch (e) {
    console.error("[apiFetch] CSRF refresh request failed:", e);
    showErrorToast("خطأ في الشبكة", "فشل الاتصال بالخادم. تحقق من الإنترنت.");
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

  let retries = 0;

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      console.log(`[apiFetch] Making request to: ${url}`);
      const response = await fetchWithCsrf(input, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      // التعامل مع 401
      if (response.status === 401) {
        console.warn(`[apiFetch] Received 401 for: ${url}`);
        if (await handle401Error()) {
          console.log(`[apiFetch] Retrying after session refresh: ${url}`);
          return attemptFetch();
        }
        return response;
      }

      // التعامل مع 403
      if (response.status === 403) {
        console.warn(`[apiFetch] Received 403 for: ${url}`);
        if (await handle403Error()) {
          console.log(`[apiFetch] Retrying after CSRF refresh: ${url}`);
          return attemptFetch();
        }
        return response;
      }

      // التعامل مع أخطاء الخادم 5xx
      if (response.status >= 500 && response.status < 600) {
        if (retries < MAX_RETRIES) {
          console.warn(`[apiFetch] Server error ${response.status} for: ${url}. Retry ${retries + 1}/${MAX_RETRIES}`);
          retries++;
          await delay(RETRY_DELAY_MS);
          return attemptFetch();
        }
        console.error(`[apiFetch] Max retries reached for server error: ${url}`);
      }

      // تحقق من صحة الاستجابة
      const validRes = await validateResponse(response);

      // تم إلغاء التخزين المؤقت بالكامل
      // لا يتم تخزين أي بيانات مؤقتاً

      return validRes;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          console.error(`[apiFetch] Request aborted due to timeout: ${url}`);
          showErrorToast("انتهت مهلة الطلب", "استغرق الطلب وقتًا طويلاً. يرجى المحاولة مرة أخرى.");
          throw new Error("Request timeout");
        }
        console.error(`[apiFetch] Fetch error for ${url}:`, error.message);
        throw error;
      } else {
        console.error(`[apiFetch] Unknown error for ${url}:`, error);
        throw new Error("An unknown error occurred");
      }
    }
  };

  return attemptFetch();
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

  const memoizedApiFetch = useCallback<FetchFunction>(async (input, init) => {
    return apiFetch(input, init);
  }, []);

  return { apiFetch: memoizedApiFetch };
};
