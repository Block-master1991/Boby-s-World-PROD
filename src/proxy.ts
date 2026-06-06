import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * 🧠 Enterprise Proxy Security Layer
 * - Route-based CSP (Admin / Game / API)
 * - Next.js 16 compatible
 * - Web3 + GraphQL + WebSockets safe
 */

function isAdmin(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function isAPI(pathname: string): boolean {
  return pathname.startsWith("/api");
}

/**
 * 🔐 CSP Builder (Route-aware)
 */
function buildCSP(mode: "admin" | "game" | "api"): string {
  // 🔴 ADMIN (Strict Security Mode)
  if (mode === "admin") {
    return `
      default-src 'self';

      script-src 'self' 'unsafe-eval';

      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com;

      font-src 'self' https://fonts.gstatic.com data:;

      img-src 'self' https: data: blob:;

      connect-src 'self' https: wss:;

      frame-src 'self' https://challenges.cloudflare.com;

      object-src 'none';

      base-uri 'self';

      form-action 'self';

      frame-ancestors 'none';

      upgrade-insecure-requests;
    `
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // 🟡 GAME (Balanced Production Mode)
if (mode === "game") {
  return `
    default-src 'self';

    script-src 
      'self' 
      'unsafe-inline' 
      'unsafe-eval' 
      https://www.google.com
      https://www.gstatic.com
      https://recaptcha.google.com
      https://challenges.cloudflare.com;

    style-src 
      'self' 
      'unsafe-inline'
      https://fonts.googleapis.com
      https://fonts.gstatic.com;

    font-src
      'self'
      https://fonts.gstatic.com
      data:;

    img-src 
      'self' 
      https: 
      data: 
      blob:;

    connect-src includes
      'self' 
      https: 
      wss: 
      ws: 
      data: 
      blob:
      https://www.google.com
      https://www.gstatic.com
      https://recaptcha.google.com
      https://challenges.cloudflare.com;

    frame-src 
      'self' 
      https://www.google.com
      https://www.gstatic.com
      https://recaptcha.google.com
      https://challenges.cloudflare.com;

    worker-src 'self' data: 
      blob:;

    media-src 'self' blob: data:;

    object-src 'none';

    base-uri 'self';

    form-action 'self';

    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

  // 🔵 API (No browser execution context)
  return `
    default-src 'none';
    connect-src 'self';
    object-src 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * 🚀 Main Proxy Middleware
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 🔍 Detect route type
  const mode: "admin" | "game" | "api" = isAdmin(pathname)
    ? "admin"
    : isAPI(pathname)
      ? "api"
      : "game";

  const csp = buildCSP(mode);

  const response = NextResponse.next();

  // 🔐 Security Headers (All Routes)
  response.headers.set("Content-Security-Policy", csp);
response.headers.set("X-DNS-Prefetch-Control", "off");
response.headers.set("X-XSS-Protection", "0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );

  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  response.headers.set("X-DNS-Prefetch-Control", "off");

  // 🌐 HSTS only in production
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

/**
 * 🎯 Route matcher (exclude static assets)
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json).*)",
  ],
};