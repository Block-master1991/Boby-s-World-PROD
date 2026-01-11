import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

interface InventoryItem {
  id: string;
  quantity: number;
}

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/consumeProtectionBottle called");

  // userPublicKey is now available directly from request.user
  const userPublicKey = request.user.sub;

  try {
    await initializeAdminApp();
    const db = getFirestore();
    const playerDocRef = db.collection('players').doc(userPublicKey);

    const docSnap = await playerDocRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Player data not found.' }, { status: 404 });
    }

    const playerData = docSnap.data();
    const currentInventory = playerData?.inventory || [];

    const protectionBottleId = '1'; // Assuming '1' is the ID for Protection Bottle
    const BottleIndex = currentInventory.findIndex((item: InventoryItem) => item.id === protectionBottleId);

    if (BottleIndex === -1) {
      return NextResponse.json({ error: 'No Protection Bottles available.' }, { status: 400 });
    }

    // Remove one protection Bottle from the inventory
    currentInventory.splice(BottleIndex, 1);

    await playerDocRef.update({
      inventory: currentInventory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const response = NextResponse.json({ message: 'Protection Bottle consumed successfully.', newInventory: currentInventory });

    // Issue new CSRF Token using the helper
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userPublicKey, requestHost);
  } catch (error) {
    logger.error("Error consuming protection Bottle:", error as Error);
    let errorMessage = error instanceof Error ? error.message : 'Failed to consume protection Bottle.';
    let statusCode = 500;

    if (error instanceof Error && error.message.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up. Please check your FIREBASE_SERVICE_ACCOUNT environment variable.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Player data not found")) {
      statusCode = 404;
    } else if (errorMessage.includes("No Protection Bottles available")) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
