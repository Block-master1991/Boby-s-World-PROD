// Server-side only constants - DO NOT import into client-side components!

import { env } from "./config/env";

export const {
  RECAPTCHA_SECRET_KEY,
  DEDICATED_RPC_ENDPOINT,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  REDIS_URL,
  SLACK_WEBHOOK_URL,
  MASTER_ENCRYPTION_KEY,
  RESEND_API_KEY,
  FROM_EMAIL,
} = env;
