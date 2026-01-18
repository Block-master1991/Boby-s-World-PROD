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

    const data = docSnap.data() as PlayerDocument;
    const currentBalance = data['gameUSDTBalance'] as number || 0;
    const newBalance = Math.max(0, currentBalance - amount); // Ensure balance doesn't go below zero

    await playerDocRef.update({
      gameUSDTBalance: newBalance,
      lastInteraction: FieldValue.serverTimestamp()
    });

    // Fetch the updated balance to return to the client
    const updatedDocSnap = await playerDocRef.get();
    const updatedData = updatedDocSnap.data() as PlayerDocument | undefined;
    const updatedBalance = updatedDocSnap.exists ? updatedData?.gameUSDTBalance || 0 : 0;

    const response = NextResponse.json({ success: true, newBalance: updatedBalance });

    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    return formatGameError(error, 'applyPenalty');
  }
}));

function formatGameError(error: unknown, context: string) {
  logger.error(`[${context}] Error:`, error as Error);
  let errorMessage = error instanceof Error ? error.message : `Failed to ${context}`;
  let statusCode = 500;

  if (errorMessage.includes("Firebase Admin SDK")) {
    errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
  } else if (errorMessage.includes("Authentication required")) {
    statusCode = 401;
  } else if (errorMessage.includes("Player data not found")) {
    statusCode = 404;
  } else if (errorMessage.includes('Insufficient balance')) {
    statusCode = 400;
  }

  return NextResponse.json({ error: errorMessage }, { status: statusCode });
}
