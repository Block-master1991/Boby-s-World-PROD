import { z } from "zod";

/**
 * Environment types
 */
export type AppEnv = "development" | "staging" | "production" | "test";

/**
 * Schema for environment variables.
 * This ensures that the application doesn't start if critical variables are missing.
 */
const envSchema = z.object({
  // Backend / Server-side secrets
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  DEDICATED_RPC_ENDPOINT: z.string().url().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters").optional(),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters").optional(),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL").optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  MASTER_ENCRYPTION_KEY: z.string().min(1, "MASTER_ENCRYPTION_KEY is required (JWK format or hex)").optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  JUPITER_API_KEY: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  AWS_CLOUDFRONT_DISTRIBUTION_ID: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // Logging & Monitoring
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_ENCRYPTION_ENABLED: z
    .string()
    .transform(v => v === "true")
    .optional(),
  LOG_ENCRYPTION_KEY: z.string().optional(),
  LOG_TAMPER_DETECTION: z
    .string()
    .transform(v => v === "true")
    .optional(),
  LOG_SIGNING_SECRET: z.string().optional(),

  // Security & Admin
  CRON_SECRET: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  ALLOWED_ADMIN_IPS: z.string().optional(),

  // Infrastructure
  REDIS_CLUSTER_MODE: z
    .string()
    .transform(v => v === "true")
    .optional(),

  // Client-side / Public variables (Must be prefixed with NEXT_PUBLIC_)
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_ADMIN_WALLET_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_CDN_BASE_URL: z.string().url().default("https://cdn.bobyworld.com"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
});

// Parse and validate process.env
// IMPORTANT: Next.js requires NEXT_PUBLIC_ vars to be referenced as literal strings
// for client-side bundling. Dynamic access to process.env doesn't work on the client.
const clientEnvValues = {
  // Server-side (will be undefined on client, which is fine - they're optional)
  NODE_ENV: process.env.NODE_ENV,
  RECAPTCHA_SECRET_KEY: process.env["RECAPTCHA_SECRET_KEY"],
  DEDICATED_RPC_ENDPOINT: process.env["DEDICATED_RPC_ENDPOINT"],
  FIREBASE_CLIENT_EMAIL: process.env["FIREBASE_CLIENT_EMAIL"],
  FIREBASE_PRIVATE_KEY: process.env["FIREBASE_PRIVATE_KEY"],
  JWT_ACCESS_SECRET: process.env["JWT_ACCESS_SECRET"],
  JWT_REFRESH_SECRET: process.env["JWT_REFRESH_SECRET"],
  REDIS_URL: process.env["REDIS_URL"],
  SLACK_WEBHOOK_URL: process.env["SLACK_WEBHOOK_URL"],
  MASTER_ENCRYPTION_KEY: process.env["MASTER_ENCRYPTION_KEY"],
  RESEND_API_KEY: process.env["RESEND_API_KEY"],
  FROM_EMAIL: process.env["FROM_EMAIL"],
  JUPITER_API_KEY: process.env["JUPITER_API_KEY"],
  CLOUDFLARE_ZONE_ID: process.env["CLOUDFLARE_ZONE_ID"],
  CLOUDFLARE_API_TOKEN: process.env["CLOUDFLARE_API_TOKEN"],
  AWS_CLOUDFRONT_DISTRIBUTION_ID: process.env["AWS_CLOUDFRONT_DISTRIBUTION_ID"],
  AWS_ACCESS_KEY_ID: process.env["AWS_ACCESS_KEY_ID"],
  AWS_SECRET_ACCESS_KEY: process.env["AWS_SECRET_ACCESS_KEY"],
  LOG_LEVEL: process.env["LOG_LEVEL"],
  LOG_ENCRYPTION_ENABLED: process.env["LOG_ENCRYPTION_ENABLED"],
  LOG_ENCRYPTION_KEY: process.env["LOG_ENCRYPTION_KEY"],
  LOG_TAMPER_DETECTION: process.env["LOG_TAMPER_DETECTION"],
  LOG_SIGNING_SECRET: process.env["LOG_SIGNING_SECRET"],
  CRON_SECRET: process.env["CRON_SECRET"],
  ADMIN_TOKEN: process.env["ADMIN_TOKEN"],
  ALLOWED_ADMIN_IPS: process.env["ALLOWED_ADMIN_IPS"],
  REDIS_CLUSTER_MODE: process.env["REDIS_CLUSTER_MODE"],

  // Client-side (MUST be literal strings for Next.js to bundle them)
  NEXT_PUBLIC_SOLANA_RPC_URL: process.env["NEXT_PUBLIC_SOLANA_RPC_URL"],
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: process.env["NEXT_PUBLIC_RECAPTCHA_SITE_KEY"],
  NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS:
    process.env["NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS"],
  NEXT_PUBLIC_ADMIN_WALLET_ADDRESS: process.env["NEXT_PUBLIC_ADMIN_WALLET_ADDRESS"],
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env["NEXT_PUBLIC_FIREBASE_API_KEY"],
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"],
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"],
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"],
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"],
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env["NEXT_PUBLIC_FIREBASE_APP_ID"],
  NEXT_PUBLIC_CDN_BASE_URL: process.env["NEXT_PUBLIC_CDN_BASE_URL"],
  NEXT_PUBLIC_APP_URL: process.env["NEXT_PUBLIC_APP_URL"],
  NEXT_PUBLIC_VERCEL_ENV: process.env["NEXT_PUBLIC_VERCEL_ENV"],
  NEXT_PUBLIC_VERCEL_URL: process.env["NEXT_PUBLIC_VERCEL_URL"],
};

const _env = envSchema.safeParse(clientEnvValues);

if (!_env.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment variables:", _env.error.format());
  // In development, we might want to continue, but in production, this should probably fail the build or startup
  if (process.env.NODE_ENV === "production") {
    throw new Error("Invalid environment variables for production.");
  }
}

export const env = _env.success
  ? _env.data
  : (clientEnvValues as unknown as z.infer<typeof envSchema>);

/**
 * Smart environment detection
 */
export const getAppEnv = (): AppEnv => {
  // 1. Explicit Vercel environment (preferred for Vercel deployments)
  if (process.env["NEXT_PUBLIC_VERCEL_ENV"]) {
    return process.env["NEXT_PUBLIC_VERCEL_ENV"] as AppEnv;
  }

  // 2. Client-side host detection
  if (typeof window !== "undefined") {
    const { host } = window.location;
    if (host.includes("localhost") || host.includes("127.0.0.1")) return "development";
    if (host.includes("staging")) return "staging";
    return "production";
  }

  // 3. Fallback to NODE_ENV
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "development") return "development";
  return "production";
};

export const isDev = getAppEnv() === "development";
export const isProd = getAppEnv() === "production";
export const isStaging = getAppEnv() === "staging";

/**
 * Smart origin detection
 * Works on both client and server side
 */
export const getAppOrigin = (requestHost?: string): string => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (requestHost) {
    const host = requestHost.split(":")[0] || requestHost;
    const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${protocol}://${requestHost}`;
  }

  // Fallback to environment variable or standard default
  return env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
};

/**
 * Smart domain detection (strips protocol and port)
 */
export const getAppDomain = (requestHost?: string): string => {
  const origin = getAppOrigin(requestHost);
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch {
    return "localhost";
  }
};

/**
 * Smart base domain detection (e.g., example.com from sub.example.com)
 * Used for cookies and WebAuthn RPID
 */
export const getAppBaseDomain = (requestHost?: string): string => {
  const domain = getAppDomain(requestHost);

  if (domain === "localhost" || domain === "127.0.0.1") {
    return "localhost";
  }

  // Handle tunneling services
  if (domain.includes("ngrok-free.app") || domain.includes("ngrok.io")) {
    return domain;
  }

  // Handle Vercel subdomains (e.g., something.vercel.app)
  // We MUST NOT use .vercel.app as a base domain because it's a public suffix
  if (domain.endsWith(".vercel.app")) {
    return domain;
  }

  const parts = domain.split(".");
  if (parts.length >= 2) {
    // Basic TLD check (simplified)
    return parts.slice(-2).join(".");
  }

  return domain;
};

/**
 * Unified CDN Configuration
 */
export const CDN_CONFIG = {
  enabled: isProd || isStaging,
  baseUrl: env.NEXT_PUBLIC_CDN_BASE_URL,
};

/**
 * Startup validation — executed once when the server starts.
 * Ensures all critical secrets are present and strong enough in production.
 */
if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
  const REQUIRED_SECRETS = [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "MASTER_ENCRYPTION_KEY",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL",
    "REDIS_URL",
  ] as const;

  const missing = REQUIRED_SECRETS.filter(key => !process.env[key]);

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error("❌ FATAL: Missing required environment variables in production:");
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }

  // Validate secret strength
  const JWT_ACCESS = process.env["JWT_ACCESS_SECRET"]!;
  const JWT_REFRESH = process.env["JWT_REFRESH_SECRET"]!;
  const MASTER_KEY = process.env["MASTER_ENCRYPTION_KEY"]!;

  if (JWT_ACCESS.length < 64) {
    // eslint-disable-next-line no-console
    console.error("❌ FATAL: JWT_ACCESS_SECRET must be at least 64 characters");
    process.exit(1);
  }
  if (JWT_REFRESH.length < 64) {
    // eslint-disable-next-line no-console
    console.error("❌ FATAL: JWT_REFRESH_SECRET must be at least 64 characters");
    process.exit(1);
  }
  // MASTER_ENCRYPTION_KEY can be in JWK format (JSON) or hex format
  try {
    const parsedKey = JSON.parse(MASTER_KEY);
    if (!parsedKey.kty || !parsedKey.k) {
      // eslint-disable-next-line no-console
      console.error("❌ FATAL: MASTER_ENCRYPTION_KEY JWK must contain 'kty' and 'k' fields");
      process.exit(1);
    }
  } catch {
    // Not JSON — validate as hex string (must be at least 64 hex chars = 32 bytes)
    if (MASTER_KEY.length < 64 || !/^[0-9a-fA-F]+$/.test(MASTER_KEY)) {
      // eslint-disable-next-line no-console
      console.error("❌ FATAL: MASTER_ENCRYPTION_KEY must be a valid JWK JSON or at least 64 hex characters");
      process.exit(1);
    }
  }

  // eslint-disable-next-line no-console
  console.log("✅ All required secrets validated successfully");
}
