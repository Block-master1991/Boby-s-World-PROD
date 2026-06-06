import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * ✅ Balanced CSP for Next.js 16 + Web3 apps
 * - No nonce dependency (prevents hydration break)
 * - Safe for App Router
 * - Compatible with WebSockets + GraphQL + Wallets
 */
function buildCSP(isDev: boolean): string {
  if (isDev) {
    return `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline';
      style-src 'self' 'unsafe-inline';
      img-src 'self' https: data: blob:;
      font-src 'self' https://fonts.gstatic.com;
      connect-src 'self' https: ws: wss:;
      frame-src 'self' https://www.google.com/recaptcha/ https://challenges.cloudflare.com;
      worker-src 'self' blob:;
      object-src 'none';
    `
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return `
    default-src 'self';

    script-src 
      'self' 
      'unsafe-eval' 
      'unsafe-inline';

    style-src 
      'self' 
      'unsafe-inline';

    img-src 
      'self' 
      https: 
      data: 
      blob:;

    font-src 
      'self' 
      https://fonts.gstatic.com;

    connect-src 
      'self' 
      https: 
      wss: 
      ws:;

    frame-src 
      'self' 
      https://www.google.com/recaptcha/ 
      https://challenges.cloudflare.com;

    worker-src 'self' blob:;

    media-src 'self' blob: data:;

    object-src 'none';

    base-uri 'self';

    form-action 'self';

    frame-ancestors 'none';

    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  const csp = buildCSP(isDev);

  const requestHeaders = new Headers(request.headers);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // 🔐 Security headers (safe set)
  response.headers.set("Content-Security-Policy", csp);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  response.headers.set(
    "Cross-Origin-Opener-Policy",
    "same-origin"
  );

  response.headers.set(
    "Cross-Origin-Resource-Policy",
    "same-origin"
  );

  // HSTS only production
  if (!isDev) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};