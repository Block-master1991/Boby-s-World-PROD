import { initializeAdminApp } from './firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import redis from './redis';

// جلب حالة IP من كاش Redis أو Firestore
export async function isIpInList(list: 'whitelist' | 'blacklist', ip: string): Promise<boolean> {
  const redisKey = `ratelimit:${list}:${ip}`;
  // تحقق من الكاش أولاً
  const cached = await redis.get(redisKey);
  if (cached !== null) return cached === '1';

  // إذا لم يوجد في الكاش، تحقق من Firestore
  await initializeAdminApp();
  const db = getFirestore();
  const doc = await db.collection(`ratelimit_${list}`).doc(ip).get();
  const exists = doc.exists;

  // خزّن النتيجة في Redis (مثلاً 10 دقائق)
  await redis.set(redisKey, exists ? '1' : '0', 'EX', 600);
  return exists;
}