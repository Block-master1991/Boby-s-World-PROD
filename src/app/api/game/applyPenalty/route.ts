import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/applyPenalty called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user?.sub; // Get public key from authenticated user

    if (!userPublicKey) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

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

    return NextResponse.json({ success: true, newBalance: updatedBalance });
  } catch (error: any) {
    console.error('[applyPenalty] Error:', error);
    let errorMessage = error.message || 'Failed to apply penalty';
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
});
