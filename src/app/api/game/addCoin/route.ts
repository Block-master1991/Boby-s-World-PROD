import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { initializeAdminApp } from '@/lib/firebase-admin';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/addCoin called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user.sub;

    const { amount } = await request.json();

    // === SECURITY: RATE LIMITING ===
    // Import Redis client (we'll assume it exists or use Upstash directly if needed, but it's better to import from lib)
    /*
      Note for developer: Since we found src/lib/redis.ts we will use it.
      If it's not properly set up, we need to create it.
      For now, we will add the logic here.
    */

    const { default: redis } = await import('@/lib/redis'); // Dynamic import
    const RATE_LIMIT_KEY = `rate_limit:add_coin:${userPublicKey}`;
    const RATE_LIMIT_DURATION = 2; // seconds

    if (redis) {
      const recentInteraction = await redis.get(RATE_LIMIT_KEY);
      if (recentInteraction) {
        return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
      }
      await redis.set(RATE_LIMIT_KEY, '1', 'EX', RATE_LIMIT_DURATION);
    }

    // === SECURITY: SANITY CHECKS ===
    // 1. Value must be a number
    if (typeof amount !== 'number' || isNaN(amount)) {
      return NextResponse.json({ error: 'Invalid amount: Not a number.' }, { status: 400 });
    }

    // 2. Value must be positive
    if (amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount: Must be positive.' }, { status: 400 });
    }

    // 3. Maximum batch size
    // Allow maximum 0.5 USDT per request (equals 500 coins if coin is 0.001)
    const MAX_BATCH_USDT = 0.5;
    if (amount > MAX_BATCH_USDT) {
      logger.warn(`[Security] User ${userPublicKey} attempted to add ${amount} USDT (Max: ${MAX_BATCH_USDT})`);
      // Here we can either reject the request or apply the limit only (Clamping).
      // For strict security: we reject the request.
      return NextResponse.json({ error: 'Batch limit exceeded. Suspicious activity detected.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);

    await playerDocRef.update({
      gameUSDTBalance: FieldValue.increment(amount),
      lastInteraction: FieldValue.serverTimestamp()
    });

    // Fetch the updated balance to return to the client
    const docSnap = await playerDocRef.get();
    const newBalance = docSnap.exists ? docSnap.data()?.gameUSDTBalance || 0 : 0;

    const response = NextResponse.json({ success: true, newBalance });

    // Use unified helper to update CSRF
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    logger.error('[addCoin] Error:', error as Error);
    let errorMessage = error instanceof Error ? error.message : 'Failed to add coin';
    let statusCode = 500;

    if (error instanceof Error && error.message.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up. Please check your FIREBASE_SERVICE_ACCOUNT environment variable.";
      statusCode = 500;
    } else if (error instanceof Error && errorMessage.includes("Authentication required")) {
      statusCode = 401;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
