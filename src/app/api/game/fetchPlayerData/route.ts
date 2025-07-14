import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/fetchPlayerData called"); // Updated log message

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();
    
    const userPublicKey = request.user?.sub; // Get public key from authenticated user

    if (!userPublicKey) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);
    const docSnap = await playerDocRef.get();

    if (!docSnap.exists) {
      // Create new player data if it doesn't exist
      const initialPlayerData = {
        walletAddress: userPublicKey,
        createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp(),
        inventory: [],
        gameUSDTBalance: 0,
      };
      await playerDocRef.set(initialPlayerData);
      // Return 200 OK with initial data for a new player
      return NextResponse.json({ gameUSDTBalance: 0, inventory: [] }, { status: 200 });
    }

    await playerDocRef.update({ lastLogin: FieldValue.serverTimestamp() });
    const data = docSnap.data();
    return NextResponse.json({
      gameUSDTBalance: data?.gameUSDTBalance || 0,
      inventory: data?.inventory || [],
    });
  } catch (error: any) {
    console.error('[fetchPlayerData] Error:', error); // Updated log message
    let errorMessage = error.message || 'Failed to fetch player data';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500; // Still a server error
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Player data not found")) {
      statusCode = 404;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
});
