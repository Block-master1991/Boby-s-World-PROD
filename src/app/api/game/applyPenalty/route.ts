import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/applyPenalty called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user.sub;

    const { amount } = await request.json();

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount provided.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);
    const docSnap = await playerDocRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Player data not found.' }, { status: 404 });
    }

    const currentBalance = docSnap.data()?.gameUSDTBalance || 0;
    const newBalance = Math.max(0, currentBalance - amount); // Ensure balance doesn't go below zero

    await playerDocRef.update({
      gameUSDTBalance: newBalance,
      lastInteraction: FieldValue.serverTimestamp()
    });

    // Fetch the updated balance to return to the client
    const updatedDocSnap = await playerDocRef.get();
    const updatedBalance = updatedDocSnap.exists ? updatedDocSnap.data()?.gameUSDTBalance || 0 : 0;

    const response = NextResponse.json({ success: true, newBalance: updatedBalance });

    // Issue new CSRF Token after successful request using the helper
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    logger.error('[applyPenalty] Error:', error as Error);
    let errorMessage = error instanceof Error ? error.message : 'Failed to apply penalty';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Player data not found")) {
      statusCode = 404;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
