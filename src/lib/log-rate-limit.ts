import { getFirestore } from 'firebase-admin/firestore';

export interface RateLimitLogData {
  ip: string;
  endpoint: string;
  userAgent: string;
  publicKey?: string;
  timestamp?: number;
}

export async function logRateLimitExceeded(data: RateLimitLogData) {
  const { ip, endpoint, userAgent, publicKey, timestamp } = data;
  const db = getFirestore();
  await db.collection('rateLimitLogs').add({
    ip,
    endpoint,
    userAgent,
    publicKey: publicKey || null,
    timestamp: timestamp || Date.now(),
  });
}
