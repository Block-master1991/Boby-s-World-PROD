import { z } from 'zod';

/**
 * Environment types
 */
export type AppEnv = 'development' | 'staging' | 'production' | 'test';

/**
 * Schema for environment variables.
 * This ensures that the application doesn't start if critical variables are missing.
 */
const envSchema = z.object({
  // Backend / Server-side secrets
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RECAPTCHA_SECRET_KEY: z.string().optional(),
  DEDICATED_RPC_ENDPOINT: z.string().url().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  MASTER_ENCRYPTION_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  JUPITER_API_KEY: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  AWS_CLOUDFRONT_DISTRIBUTION_ID: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  
  // Logging & Monitoring
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_ENCRYPTION_ENABLED: z.string().transform(v => v === 'true').optional(),
  LOG_ENCRYPTION_KEY: z.string().optional(),
  LOG_TAMPER_DETECTION: z.string().transform(v => v === 'true').optional(),
  LOG_SIGNING_SECRET: z.string().optional(),

  // Security & Admin
  CRON_SECRET: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  ALLOWED_ADMIN_IPS: z.string().optional(),
  
  // Infrastructure
  REDIS_CLUSTER_MODE: z.string().transform(v => v === 'true').optional(),

  // Client-side / Public variables (Must be prefixed with NEXT_PUBLIC_)
  NEXT_PUBLIC_SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_ADMIN_WALLET_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_CDN_BASE_URL: z.string().url().default('https://cdn.bobyworld.com'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  NEXT_PUBLIC_VERCEL_URL: z.string().optional(),
});

// Parse and validate process.env
// In the browser, process.env is usually injected by Next.js at build time
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:', _env.error.format());
  // In development, we might want to continue, but in production, this should probably fail the build or startup
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Invalid environment variables for production.');
  }
}

export const env = _env.success ? _env.data : (process.env as unknown as z.infer<typeof envSchema>);

/**
 * Smart environment detection
 */
export const getAppEnv = (): AppEnv => {
  // 1. Explicit Vercel environment (preferred for Vercel deployments)
  if (process.env['NEXT_PUBLIC_VERCEL_ENV']) {
    return process.env['NEXT_PUBLIC_VERCEL_ENV'] as AppEnv;
  }

  // 2. Client-side host detection
  if (typeof window !== 'undefined') {
    const { host } = window.location;
    if (host.includes('localhost') || host.includes('127.0.0.1')) return 'development';
    if (host.includes('staging')) return 'staging';
    return 'production';
  }
  
  // 3. Fallback to NODE_ENV
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.NODE_ENV === 'development') return 'development';
  return 'production';
};

export const isDev = getAppEnv() === 'development';
export const isProd = getAppEnv() === 'production';
export const isStaging = getAppEnv() === 'staging';

/**
 * Smart origin detection
 * Works on both client and server side
 */
export const getAppOrigin = (requestHost?: string): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (requestHost) {
    const host = requestHost.split(':')[0] || requestHost;
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    return `${protocol}://${requestHost}`;
  }

  // Fallback to environment variable or standard default
  return env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
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
    return 'localhost';
  }
};

/**
 * Smart base domain detection (e.g., example.com from sub.example.com)
 * Used for cookies and WebAuthn RPID
 */
export const getAppBaseDomain = (requestHost?: string): string => {
  const domain = getAppDomain(requestHost);
  
  if (domain === 'localhost' || domain === '127.0.0.1') {
    return 'localhost';
  }

  // Handle tunneling services
  if (domain.includes('ngrok-free.app') || domain.includes('ngrok.io')) {
    return domain;
  }

  // Handle Vercel subdomains (e.g., something.vercel.app)
  // We MUST NOT use .vercel.app as a base domain because it's a public suffix
  if (domain.endsWith('.vercel.app')) {
    return domain;
  }

  const parts = domain.split('.');
  if (parts.length >= 2) {
    // Basic TLD check (simplified)
    return parts.slice(-2).join('.');
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
