/**
 * 🛡️ Centralized Content Security Policy (CSP) Configuration
 * Single Source of Truth for all CSP directives across the application.
 *
 * Architecture:
 * - Route-aware: Admin / Game / API each get tailored policies
 * - Environment-aware: Stricter in production, relaxed for development
 * - Web3-safe: Solana RPC, WalletConnect, Jupiter API
 * - Firebase-safe: Auth, Firestore, Storage
 * - Game-safe: Three.js, WebGL, Workers, Audio, Media
 *
 * Maintained from: proxy.ts (middleware) + headers.ts (next.config)
 */

// ─── Domain Whitelists ───────────────────────────────────────────────

/** Solana ecosystem domains */
const SOLANA_DOMAINS = [
  "https://api.mainnet-beta.solana.com",
  "https://api.devnet.solana.com",
  "https://api.testnet.solana.com",
  "https://rpc.ankr.com",
  "https://solana-api.projectserum.com",
] as const;

/** WalletConnect relay domains */
const WALLETCONNECT_DOMAINS = [
  "https://relay.walletconnect.com",
  "https://explorer-api.walletconnect.com",
  "wss://relay.walletconnect.com",
] as const;

/** Jupiter (Solana DEX aggregator) domains */
const JUPITER_DOMAINS = [
  "https://quote-api.jup.ag",
  "https://api.jup.ag",
  "https://price.jup.ag",
] as const;

/** Google reCAPTCHA v3 domains */
const RECAPTCHA_DOMAINS = [
  "https://www.google.com",
  "https://www.gstatic.com",
  "https://recaptcha.google.com",
] as const;

/** Cloudflare Turnstile / Challenge domains */
const CLOUDFLARE_DOMAINS = [
  "https://challenges.cloudflare.com",
] as const;

/** Google Fonts domains */
const FONTS_DOMAINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
] as const;

/** Firebase domains */
const FIREBASE_DOMAINS = [
  "https://firestore.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://fcmregistrations.googleapis.com",
  "https://firebaseremoteconfig.googleapis.com",
  "https://firebase.googleapis.com",
  "https://*.firebaseapp.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
] as const;

/** CDN domains */
const CDN_DOMAINS = [
  "https://cdn.bobyworld.com",
] as const;

// ─── Helper: Build directive string ──────────────────────────────────

function directive(sources: readonly string[]): string {
  return sources.join(" ");
}

// ─── CSP Modes ───────────────────────────────────────────────────────

export type CSPMode = "admin" | "game" | "api";

/**
 * Build the full CSP string for a given mode and environment.
 *
 * @param mode - Route type: "admin" | "game" | "api"
 * @param isDev - Whether running in development mode
 * @param appOrigin - The app's own origin (e.g. http://localhost:3000)
 */
export function buildCSP(
  mode: CSPMode,
  isDev: boolean = false
): string {
  // Dev-only additions
  const devScriptSrc = isDev ? ["'unsafe-eval'"] : [];
  const devConnectSrc = isDev
    ? [
        "ws://localhost:3000",
        "ws://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]
    : [];

  // ─── 🔴 ADMIN (Strict Security) ─────────────────────────────────
  if (mode === "admin") {
    return [
      "default-src 'self';",
      `script-src 'self' ${directive(devScriptSrc)} ${directive([...CLOUDFLARE_DOMAINS])};`,
      `style-src 'self' 'unsafe-inline' ${directive(FONTS_DOMAINS)};`,
      `font-src 'self' https://fonts.gstatic.com data:;`,
      `img-src 'self' https: data: blob:;`,
      `connect-src 'self' https: wss: ${directive(devConnectSrc)} ${directive(FIREBASE_DOMAINS)} ${directive(SOLANA_DOMAINS)} ${directive(CDN_DOMAINS)};`,
      `frame-src 'self' ${directive(CLOUDFLARE_DOMAINS)};`,
      "object-src 'none';",
      "base-uri 'self';",
      "form-action 'self';",
      "frame-ancestors 'none';",
      isDev ? "" : "upgrade-insecure-requests;",
    ]
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ─── 🟡 GAME (Balanced Production) ──────────────────────────────
  if (mode === "game") {
    return [
      "default-src 'self';",

      // Script: reCAPTCHA + Cloudflare + dev HMR
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${directive([...RECAPTCHA_DOMAINS, ...CLOUDFLARE_DOMAINS])} ${directive(devScriptSrc)};`,

      // Style: Google Fonts + inline (needed for Three.js canvas + Next.js)
      `style-src 'self' 'unsafe-inline' ${directive(FONTS_DOMAINS)};`,

      // Font: Google Fonts + data URIs
      `font-src 'self' https://fonts.gstatic.com data:;`,

      // Images: all HTTPS + data URIs + blob (Three.js textures)
      "img-src 'self' https: data: blob:;",

      // Connect: Solana RPC + Firebase + WalletConnect + Jupiter + CDN + reCAPTCHA + dev
      `connect-src 'self' https: wss: ws: data: blob: ${directive([
        ...SOLANA_DOMAINS,
        ...FIREBASE_DOMAINS,
        ...WALLETCONNECT_DOMAINS,
        ...JUPITER_DOMAINS,
        ...RECAPTCHA_DOMAINS,
        ...CLOUDFLARE_DOMAINS,
        ...CDN_DOMAINS,
      ])} ${directive(devConnectSrc)};`,

      // Frame: reCAPTCHA + Cloudflare
      `frame-src 'self' ${directive([...RECAPTCHA_DOMAINS, ...CLOUDFLARE_DOMAINS])};`,

      // Workers: Three.js offscreen + game chunk workers
      "worker-src 'self' blob: data:;",

      // Media: game audio blobs
      "media-src 'self' blob: data:;",

      // Manifest for PWA
      "manifest-src 'self';",

      "object-src 'none';",
      "base-uri 'self';",
      "form-action 'self';",
      "frame-ancestors 'none';",
      isDev ? "" : "upgrade-insecure-requests;",
    ]
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // ─── 🔵 API (No browser execution context) ──────────────────────
  return [
    "default-src 'none';",
    "connect-src 'self';",
    "object-src 'none';",
  ]
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Security Headers ────────────────────────────────────────────────

/**
 * Build security headers for a given route mode.
 * These complement the CSP and provide defense-in-depth.
 */
export function buildSecurityHeaders(
  mode: CSPMode,
  isDev: boolean = false
): Record<string, string> {
  const headers: Record<string, string> = {};

  // ─── CSP ──────────────────────────────────────────────────────
  headers["Content-Security-Policy"] = buildCSP(mode, isDev);

  // ─── DNS Prefetch ─────────────────────────────────────────────
  headers["X-DNS-Prefetch-Control"] = "on";

  // ─── MIME Sniffing Protection ─────────────────────────────────
  headers["X-Content-Type-Options"] = "nosniff";

  // ─── XSS Protection (modern approach: disabled, rely on CSP) ──
  headers["X-XSS-Protection"] = "0";

  // ─── Clickjacking Protection ──────────────────────────────────
  // Admin & API: DENY, Game: SAMEORIGIN (for wallet iframe compat)
  if (mode === "game") {
    headers["X-Frame-Options"] = "SAMEORIGIN";
  } else {
    headers["X-Frame-Options"] = "DENY";
  }

  // ─── Referrer Policy ──────────────────────────────────────────
  headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

  // ─── Permissions Policy ───────────────────────────────────────
  if (mode === "game") {
    // Game may need accelerometer for mobile controls
    headers["Permissions-Policy"] =
      "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), bluetooth=(), magnetometer=(), gyroscope=(self), accelerometer=(self)";
  } else {
    headers["Permissions-Policy"] =
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()";
  }

  // ─── Cross-Origin Policies ────────────────────────────────────
  // game needs same-origin-allow-popups for wallet popups (Phantom, Solflare)
  if (mode === "game") {
    headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups";
  } else {
    headers["Cross-Origin-Opener-Policy"] = "same-origin";
  }
  headers["Cross-Origin-Resource-Policy"] = "same-origin";
  headers["Cross-Origin-Embedder-Policy"] = "credentialless";

  // ─── HSTS (Production Only) ──────────────────────────────────
  if (!isDev) {
    headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
  }

  return headers;
}
