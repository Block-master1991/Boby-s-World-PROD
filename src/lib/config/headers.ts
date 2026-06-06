/**
 * Security and Caching Headers for next.config.ts
 *
 * NOTE: CSP is now managed dynamically via middleware (proxy.ts + csp.ts)
 * This file only handles caching headers and non-CSP security headers
 * that apply globally at the Next.js config level.
 *
 * The CSP in SECURITY_HEADERS is a FALLBACK only - it will be overridden
 * by the middleware's route-aware CSP on dynamic pages.
 */

export const CACHE_HEADERS = [
  {
    // Cache game textures and models for long term
    source: "/textures/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable", // 1 year cache
      },
    ],
  },
  {
    source: "/models/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable", // 1 year cache
      },
    ],
  },
  {
    // Cache libs for long term (WebGL, Draco, etc.)
    source: "/libs/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable", // 1 year cache
      },
    ],
  },
  {
    // Cache audio files
    source: "/audio/:path*",
    headers: [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable", // 1 year cache
      },
    ],
  },
];

/**
 * Global security headers applied at the Next.js config level.
 * These serve as a baseline and are overridden by middleware where applicable.
 *
 * CSP is intentionally EXCLUDED here because it is managed dynamically
 * by the middleware (proxy.ts) using route-aware policies from csp.ts.
 */
export const SECURITY_HEADERS = [
  {
    source: "/:path*",
    headers: [
      {
        key: "X-DNS-Prefetch-Control",
        value: "on",
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-XSS-Protection",
        value: "0", // Modern approach: rely on CSP instead
      },
      {
        key: "X-Frame-Options",
        value: "DENY", // Overridden by middleware for game routes
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()",
      },
      {
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin",
      },
      {
        key: "Cross-Origin-Resource-Policy",
        value: "same-origin",
      },
    ],
  },
];

/**
 * Combined headers configuration
 */
export const GLOBAL_HEADERS = [...CACHE_HEADERS, ...SECURITY_HEADERS];
