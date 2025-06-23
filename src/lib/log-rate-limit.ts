// يمكنك وضع هذا في ملف منفصل src/lib/log-rate-limit.ts
import { getFirestore } from 'firebase-admin/firestore';
export async function logRateLimitExceeded(ip: string, endpoint: string, userAgent: string, publicKey?: string, timestamp?: number) {
  const db = getFirestore();
  await db.collection('rateLimitLogs').add({
    ip,
    endpoint,
    userAgent,
    publicKey: publicKey || null,
    timestamp: Date.now(),
  });
}