import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';
import type { PlayerDocument } from '@/types/database';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/applyPenalty called");

  try {
    await initializeAdminApp();
    const db = getFirestore();
    const userPublicKey = request.user.sub;
    const { amount, batchId } = await request.json();

    const redisModule = await import('@/lib/redis');
    const redis = redisModule.default;

    // 1. Idempotency Check
    if (redis && batchId) {
        const IDEMPOTENCY_KEY = `idemp:penalty:${userPublicKey}:${batchId}`;
        const alreadyProcessed = await redis.get(IDEMPOTENCY_KEY);
        if (alreadyProcessed) {
            const playerDoc = await db.collection('players').doc(userPublicKey).get();
            return NextResponse.json({ success: true, newBalance: (playerDoc.data() as PlayerDocument).gameUSDTBalance, idempotent: true });
        }
    }

    if (typeof amount !== 'number' || amount <= 0) return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });

    const isGranular = Math.abs((amount * 1000) % 1) < 0.0001 || Math.abs((amount * 1000) % 1) > 0.9999;
    if (!isGranular) return NextResponse.json({ error: 'Invalid granularity.' }, { status: 400 });

    const updatedBalance = await executePenalty(db, userPublicKey, amount, batchId);

    if (redis && batchId) {
      await redis.set(`idemp:penalty:${userPublicKey}:${batchId}`, '1', 'EX', 600);
    }

    const response = NextResponse.json({ success: true, newBalance: updatedBalance });
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    return formatGameError(error, 'applyPenalty');
  }
}));

function executePenalty(db: FirebaseFirestore.Firestore, userPublicKey: string, amount: number, batchId?: string) {
  const playerDocRef = db.collection('players').doc(userPublicKey);
  return db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(playerDocRef);
    if (!docSnap.exists) throw new Error('Player data not found.');
    const currentBalance = (docSnap.data() as PlayerDocument).gameUSDTBalance || 0;
    const newBalance = Math.max(0, Number((currentBalance - amount).toFixed(6)));
    
    logger.log(`[Database] applyPenalty - User: ${userPublicKey}, Old: ${currentBalance}, Penalty: ${amount}, New: ${newBalance}, Batch: ${batchId || 'N/A'}`);
    
    transaction.update(playerDocRef, { 
      gameUSDTBalance: newBalance, 
      lastInteraction: FieldValue.serverTimestamp(),
      lastProcessedBatchId: batchId || ""
    });
    return newBalance;
  });
}

function formatGameError(error: unknown, context: string) {
  logger.error(`[${context}] Error:`, error as Error);
  const msg = error instanceof Error ? error.message : `Failed to ${context}`;
  const codeMap:Record<string, number> = { "Firebase": 500, "Auth": 401, "Player": 404, "Insufficient": 400 };
  const status = Object.entries(codeMap).find(([k]) => msg.includes(k))?.[1] || 500;
  return NextResponse.json({ error: msg }, { status });
}
