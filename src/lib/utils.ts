import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { logger } from "utils/logger";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Helper function to get a cookie by name.
 * @param name The name of the cookie to retrieve.
 * @returns The cookie value or null if not found.
 */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null; // Not in a browser environment
  }
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

/**
 * A wrapper around the native `fetch` API that automatically includes the CSRF token
 * for non-GET requests.
 * @param input The RequestInfo or URL.
 * @param init The RequestInit options.
 * @returns A Promise that resolves to the Response to the request.
 */
export function fetchWithCsrf(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = init?.method?.toUpperCase() || "GET";

  // Only add CSRF token for methods that modify state
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrfToken = getCookie("csrfToken");

    if (!csrfToken) {
      logger.warn(
        "[fetchWithCsrf] CSRF token not found in cookies. This is normal for unauthenticated requests, but will fail for protected routes."
      );
      // Don't throw here, let the request proceed. The server will reject it if CSRF is required.
    } else {
      const headers = new Headers(init?.headers);
      headers.set("X-CSRF-Token", csrfToken);

      // Create a clean options object to avoid passing undefined values to optional properties
      // when exactOptionalPropertyTypes is enabled.
      const fetchOptions: RequestInit = {
        ...init,
        headers,
      };

      // Ensure signal is only set if it's not undefined
      if (init?.signal === null) {
        fetchOptions.signal = null;
      } else if (init?.signal) {
        fetchOptions.signal = init.signal;
      } else {
        delete fetchOptions.signal;
      }

      return fetch(input, fetchOptions);
    }
  }

  // For GET and other methods, just use native fetch
  return fetch(input, init);
}

// Mobile device detection (for performance optimization)
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false; // SSR safe

  // Check user agent for common mobile indicators
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

  // Also check for touch capability and screen size as backup
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 768;

  return mobileRegex.test(userAgent) || (hasTouch && smallScreen);
}

// Get mobile performance level (higher = more capable)
export function getMobilePerformanceLevel(): "low" | "medium" | "high" {
  if (typeof navigator === "undefined") return "high";

  // Simple heuristic based on device memory and hardware concurrency
  // deviceMemory is an experimental feature in some browsers
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;

  const score = deviceMemory * hardwareConcurrency;

  if (score <= 4) return "low"; // Low-end mobile/phone
  if (score <= 8) return "medium"; // Mid-range mobile/tablet
  return "high"; // High-end devices
}

// Performance optimization config based on device
/**
 * Helper to get environment density multipliers based on device capability
 */
function getEnvironmentDensity(isMobile: boolean, performanceLevel: string) {
  if (!isMobile) {
    return {
      grassMultiplier: 1.0,
      treeMultiplier: 1.0,
      rocksMultiplier: 1.0,
      flowersMultiplier: 1.0,
    };
  }

  const isLow = performanceLevel === "low";
  return {
    grassMultiplier: isLow ? 0.1 : 0.2,
    treeMultiplier: isLow ? 0.5 : 1.0,
    rocksMultiplier: isLow ? 0.3 : 0.5,
    flowersMultiplier: isLow ? 0.2 : 0.4,
  };
}

/**
 * Helper to get renderer settings based on device capability
 */
function getRendererSettings(isMobile: boolean, performanceLevel: string) {
  const isLow = isMobile && performanceLevel === "low";
  const isHigh = !isMobile || performanceLevel === "high";

  let pixelRatio = 1.0;
  if (typeof window !== "undefined") {
    const baseRatio = window.devicePixelRatio || 1;
    pixelRatio = Math.min(baseRatio, isMobile ? 1.5 : 2.0);
  }

  return {
    antialias: isHigh,
    shadowMapSize: isLow ? 1024 : isMobile ? 2048 : 4096,
    pixelRatio,
  };
}

/**
 * Performance optimization config based on device
 */
export function getDevicePerformanceConfig() {
  const isMobile = isMobileDevice();
  const performanceLevel = getMobilePerformanceLevel();

  return {
    isMobile,
    performanceLevel,
    environmentDensity: getEnvironmentDensity(isMobile, performanceLevel),
    renderer: getRendererSettings(isMobile, performanceLevel),
    game: {
      fpsLimit: isMobile ? 30 : 60,
      animationUpdates: !isMobile,
    },
  };
}
// Format bytes to human readable string
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}

// Format time milliseconds to readable string
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}
