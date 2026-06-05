export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // System
      NODE_ENV: "development" | "production" | "test";
      PORT?: string;

      // Database & Cache
      REDIS_URL: string;
      REDIS_CLUSTER_MODE?: string;

      // Firebase Admin
      FIREBASE_PROJECT_ID: string;
      FIREBASE_CLIENT_EMAIL: string;
      FIREBASE_PRIVATE_KEY: string;

      // Logging & Security
      LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
      LOG_ENCRYPTION_ENABLED?: string; // usually 'true' or 'false' string
      LOG_ENCRYPTION_KEY?: string;
      LOG_TAMPER_DETECTION?: string;

      // Testing
      LOAD_TEST_URL?: string;

      // API Keys & Secrets
      RESEND_API_KEY?: string;
      RECAPTCHA_SECRET_KEY?: string;
      NEXT_PUBLIC_RECAPTCHA_SITE_KEY?: string;
      SLACK_WEBHOOK_URL?: string;
      CRON_SECRET?: string;
      ADMIN_API_KEY?: string;
      JUPITER_API_KEY?: string;

      // Public Configs
      NEXT_PUBLIC_ADMIN_WALLET_ADDRESS?: string;
      NEXT_PUBLIC_GAME_VERSION?: string;
      NEXT_PUBLIC_SOLANA_RPC_URL?: string;
      NEXT_PUBLIC_STORE_TREASURY_WALLET_ADDRESS?: string;
      NEXT_PUBLIC_GAME_ENCRYPTION_KEY?: string;

      // Firebase Public Configs
      NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
      NEXT_PUBLIC_FIREBASE_API_KEY?: string;
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
      NEXT_PUBLIC_FIREBASE_APP_ID?: string;

      // Infrastructure Configs
      CLOUDFLARE_ZONE_ID?: string;
      CLOUDFLARE_API_TOKEN?: string;
      AWS_CLOUDFRONT_DISTRIBUTION_ID?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
    }
  }
}
