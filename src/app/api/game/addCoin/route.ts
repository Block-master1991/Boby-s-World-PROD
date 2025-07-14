import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/addCoin called");

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
    
    await playerDocRef.update({
      gameUSDTBalance: FieldValue.increment(amount),
      lastInteraction: FieldValue.serverTimestamp()
    });

    // Fetch the updated balance to return to the client
    const docSnap = await playerDocRef.get();
    const newBalance = docSnap.exists ? docSnap.data()?.gameUSDTBalance || 0 : 0;

    return NextResponse.json({ success: true, newBalance });
  } catch (error: any) {
    console.error('[addCoin] Error:', error);
    let errorMessage = error.message || 'Failed to add coin';
    let statusCode = 500;

    if (error.message.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up. Please check your FIREBASE_SERVICE_ACCOUNT environment variable.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
});
