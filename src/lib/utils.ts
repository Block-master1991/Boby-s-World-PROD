import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Helper function to get a cookie by name.
 * @param name The name of the cookie to retrieve.
 * @returns The cookie value or null if not found.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null; // Not in a browser environment
  }
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

/**
 * A wrapper around the native `fetch` API that automatically includes the CSRF token
 * for non-GET requests.
 * @param input The RequestInfo or URL.
 * @param init The RequestInit options.
 * @returns A Promise that resolves to the Response to the request.
 */
export async function fetchWithCsrf(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = init?.method?.toUpperCase() || 'GET';

  // Only add CSRF token for methods that modify state
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const csrfToken = getCookie('csrfToken');

    if (!csrfToken) {
      console.error('CSRF token not found. Cannot send request securely.');
      // Optionally, throw an error or return a specific response
      throw new Error('CSRF token missing. Please ensure you are logged in and the token is available.');
    }

    const headers = new Headers(init?.headers);
    headers.set('X-CSRF-Token', csrfToken);

    return fetch(input, {
      ...init,
      headers,
    });
  }

  // For GET and other methods, just use native fetch
  return fetch(input, init);
}
