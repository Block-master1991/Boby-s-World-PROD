import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { logger } from '@/utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/withdrawUSDT called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user.sub;

    const { amount } = await request.json();

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid withdrawal amount provided.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);

    // Transaction to ensure atomic read-modify-write
    const newBalance = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(playerDocRef);

      if (!docSnap.exists) {
        throw new Error('Player data not found.');
      }

      const currentBalance = docSnap.data()?.gameUSDTBalance || 0;

      if (currentBalance < amount) {
        throw new Error('Insufficient balance for withdrawal.');
      }

      const updatedBalance = currentBalance - amount;
      transaction.update(playerDocRef, {
        gameUSDTBalance: updatedBalance,
        lastInteraction: FieldValue.serverTimestamp(),
      });
      return updatedBalance;
    });

    const response = NextResponse.json({ success: true, newBalance });

    // Use unified helper to update CSRF
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error: unknown) {
    logger.error('[withdrawUSDT] Error:', error as Error);
    let errorMessage = (error instanceof Error) ? error.message : 'Failed to withdraw USDT.';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes('Insufficient balance')) {
      statusCode = 400; // Bad Request
    } else if (errorMessage.includes('Player data not found')) {
      statusCode = 404; // Not Found
    } else if (errorMessage.includes('Invalid withdrawal amount provided')) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
