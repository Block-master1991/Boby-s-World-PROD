// Server-side only constants - DO NOT import into client-side components!

export const {RECAPTCHA_SECRET_KEY} = process.env;
export const {DEDICATED_RPC_ENDPOINT} = process.env; // Assuming it should be private, so no NEXT_PUBLIC_
export const {FIREBASE_CLIENT_EMAIL} = process.env;
export const {FIREBASE_PRIVATE_KEY} = process.env;
export const {JWT_ACCESS_SECRET} = process.env;
export const {JWT_REFRESH_SECRET} = process.env;
export const {REDIS_URL} = process.env;
export const {SLACK_WEBHOOK_URL} = process.env;
export const {MASTER_ENCRYPTION_KEY} = process.env;
export const {RESEND_API_KEY} = process.env;
export const {FROM_EMAIL} = process.env;
