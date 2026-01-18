import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';
import type { PlayerDocument } from '@/types/database';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type Redis from 'ioredis';
import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/addCoin called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user.sub;

    const { amount } = await request.json();

    const redisModule = await import('@/lib/redis');
    const redis = redisModule.default;

    const rateLimitError = await checkRateLimit(redis, userPublicKey);
    if (rateLimitError) return rateLimitError;

    const sanityError = validateAmount(amount, userPublicKey);
    if (sanityError) return sanityError;

    const playerDocRef = db.collection('players').doc(userPublicKey);

    await playerDocRef.update({
      gameUSDTBalance: FieldValue.increment(amount),
      lastInteraction: FieldValue.serverTimestamp()
    });

    // Fetch the updated balance to return to the client
    const docSnap = await playerDocRef.get();
    const data = docSnap.data() as PlayerDocument | undefined;
    const newBalance = docSnap.exists ? data?.gameUSDTBalance || 0 : 0;

    const response = NextResponse.json({ success: true, newBalance });

    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    return formatGameError(error, 'addCoin');
  }
}));

async function checkRateLimit(redis: Redis | null, userPublicKey: string) {
  if (!redis) return null;
  const RATE_LIMIT_KEY = `rate_limit:add_coin:${userPublicKey}`;
  const recentInteraction = await redis.get(RATE_LIMIT_KEY);
  if (recentInteraction) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }
  await redis.set(RATE_LIMIT_KEY, '1', 'EX', 2);
  return null;
}

function validateAmount(amount: unknown, userPublicKey: string) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return NextResponse.json({ error: 'Invalid amount: Not a number.' }, { status: 400 });
  }
  if (amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount: Must be positive.' }, { status: 400 });
  }
  const MAX_BATCH_USDT = 0.005;
  if (amount > MAX_BATCH_USDT) {
    logger.warn(`[Security] User ${userPublicKey} attempted to add ${amount} USDT (Max: ${MAX_BATCH_USDT})`);
    return NextResponse.json({ error: 'Batch limit exceeded.' }, { status: 400 });
  }
  return null;
}

function formatGameError(error: unknown, context: string) {
  logger.error(`[${context}] Error:`, error as Error);
  const errorMessage = error instanceof Error ? error.message : `Failed to ${context}`;
  const statusCode = errorMessage.includes("Authentication required") ? 401 : 500;
  return NextResponse.json({ error: errorMessage }, { status: statusCode });
}
