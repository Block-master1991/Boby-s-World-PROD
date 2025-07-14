import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/useItem called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user?.sub; // Get public key from authenticated user

    if (!userPublicKey) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);
    const docSnap = await playerDocRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const data = docSnap.data()!;
    const inventory = data.inventory || [];

    const index = inventory.findIndex((entry: any) => entry?.id === itemId);
    if (index !== -1) {
      inventory.splice(index, 1);

      await playerDocRef.update({
        inventory,
        lastInteraction: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[useItem] Error:', error);
    let errorMessage = error.message || 'Failed to use item';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Item ID is required")) {
      statusCode = 400;
    } else if (errorMessage.includes("Player not found")) {
      statusCode = 404;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
});
