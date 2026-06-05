import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const isDev = process.env.NODE_ENV === "development";

  // CSP Header Configuration
  // In development: Be very permissive to allow Next.js tooling and HMR
  // In production: Strict CSP with nonce-based scripts

  let cspHeader: string;

  if (isDev) {
    // Development: Fully permissive for HMR, Fast Refresh, and browser extensions
    cspHeader = `
      default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      img-src 'self' https: data: blob:; font-src 'self' https://fonts.gstatic.com data:;
      media-src 'self' blob: data:; object-src 'none';
      base-uri 'self'; form-action 'self'; frame-ancestors 'self';
      frame-src 'self' https://www.google.com/recaptcha/ https://challenges.cloudflare.com;
      connect-src 'self' https: wss: ws: blob: data:; worker-src 'self' blob: data:;
    `
      .replace(/\s{2,}/g, " ")
      .trim();
  } else {
    // Production: Strict CSP with nonce
    cspHeader = `
      default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:;
      style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com;
      img-src 'self' https: data: blob:; font-src 'self' https://fonts.gstatic.com data:;
      media-src 'self' blob: data:; object-src 'none'; base-uri 'self';
      form-action 'self'; frame-ancestors 'self';
      frame-src 'self' https://www.google.com/recaptcha/ https://challenges.cloudflare.com;
      connect-src 'self' https: wss: blob: data:;
      worker-src 'self' blob: data:; upgrade-insecure-requests;
    `
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
