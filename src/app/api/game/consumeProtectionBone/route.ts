import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/consumeProtectionBone called");

  // userPublicKey is now available directly from request.user
  const userPublicKey = request.user?.sub;

  if (!userPublicKey) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

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

    const protectionBoneId = '1'; // Assuming '1' is the ID for Protection Bone
    const boneIndex = currentInventory.findIndex((item: any) => item.id === protectionBoneId);

    if (boneIndex === -1) {
      return NextResponse.json({ error: 'No Protection Bones available.' }, { status: 400 });
    }

    // Remove one protection bone from the inventory
    currentInventory.splice(boneIndex, 1);

    await playerDocRef.update({
      inventory: currentInventory,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Protection Bone consumed successfully.', newInventory: currentInventory });

  } catch (error: any) {
    console.error("Error consuming protection bone:", error);
    let errorMessage = error.message || 'Failed to consume protection bone.';
    let statusCode = 500;

    if (error.message.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up. Please check your FIREBASE_SERVICE_ACCOUNT environment variable.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Player data not found")) {
      statusCode = 404;
    } else if (errorMessage.includes("No Protection Bones available")) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
});
