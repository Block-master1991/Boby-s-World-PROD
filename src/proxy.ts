import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildSecurityHeaders, type CSPMode } from "@/lib/config/csp";
import { isDev } from "@/lib/config/env";

/**
 * 🧠 Enterprise Proxy Security Layer
 * - Route-based CSP (Admin / Game / API)
 * - Next.js 16 compatible
 * - Web3 + GraphQL + WebSockets safe
 * - Environment-aware (dev vs prod)
 */

function isAdmin(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function isAPI(pathname: string): boolean {
  return pathname.startsWith("/api");
}

/**
 * 🚀 Main Proxy Middleware
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 🔍 Detect route type
  const mode: CSPMode = isAdmin(pathname)
    ? "admin"
    : isAPI(pathname)
      ? "api"
      : "game";

  const response = NextResponse.next();

  // 🔐 Security Headers (Centralized from csp.ts)
  const securityHeaders = buildSecurityHeaders(mode, isDev);

  for (const [key, value] of Object.entries(securityHeaders)) {
    if (value) {
      response.headers.set(key, value);
    }
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
