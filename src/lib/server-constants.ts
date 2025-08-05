// Server-side only constants - DO NOT import into client-side components!

export const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
export const DEDICATED_RPC_ENDPOINT = process.env.DEDICATED_RPC_ENDPOINT; // Assuming it should be private, so no NEXT_PUBLIC_
export const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
export const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
export const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
export const REDIS_URL = process.env.REDIS_URL;
export const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
export const MASTER_ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY;
