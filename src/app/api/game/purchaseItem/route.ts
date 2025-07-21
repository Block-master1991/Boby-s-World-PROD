import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // استيراد CSRF middleware
import { CSRFManager } from '@/lib/csrf-utils'; // استيراد CSRFManager
import { JWTManager } from '@/lib/jwt-utils'; // لاستخدام createSecureCookieOptions
import { storeItems } from '@/lib/items'; // To validate item existence

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/purchaseItem called");

  const userPublicKey = request.user?.sub;

  if (!userPublicKey) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  try {
    const { itemId, quantity, transactionSignature } = await request.json();

    if (!itemId || typeof quantity !== 'number' || quantity <= 0 || !transactionSignature) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }

    // Validate item existence
    const itemDefinition = storeItems.find(item => item.id === itemId);
    if (!itemDefinition) {
      return NextResponse.json({ error: 'Invalid item ID.' }, { status: 400 });
    }

    await initializeAdminApp();
    const db = getFirestore();
    const playerDocRef = db.collection('players').doc(userPublicKey);

    // Optional: Verify the transactionSignature on the backend
    // This would involve using Solana web3.js to fetch the transaction
    // and verify its details (sender, receiver, amount, token mint).
    // For now, we'll trust the frontend's successful sendTransaction call.
    console.log(`[API] Verifying transaction signature (placeholder): ${transactionSignature}`);
    // In a real application, you'd add robust Solana transaction verification here.

    const itemsToAdd = Array(quantity).fill(null).map(() => ({
      id: itemDefinition.id,
      name: itemDefinition.name,
      image: itemDefinition.image,
      description: itemDefinition.description,
      dataAiHint: itemDefinition.dataAiHint,
      instanceId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}` // Unique instance ID
    }));

    await playerDocRef.update({
      inventory: FieldValue.arrayUnion(...itemsToAdd),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const response = NextResponse.json({ message: `${quantity} ${itemDefinition.name}(s) added to inventory.`, newItems: itemsToAdd });

    // إصدار CSRF Token جديد بعد الطلب الناجح
    const requestHost = request.headers.get('host') || undefined;
    const csrfToken = await CSRFManager.getOrCreateToken(userPublicKey);
    response.cookies.set('csrfToken', csrfToken, {
      httpOnly: false,
      secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
      sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
      maxAge: 30 * 60, // 30 دقيقة
      path: '/',
    });
    console.log('[purchaseItem] New CSRF token issued and set in cookie.');

    return response;
  } catch (error: any) {
    console.error("Error processing item purchase:", error);
    let errorMessage = error.message || 'Failed to process item purchase.';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Invalid request parameters")) {
      statusCode = 400;
    } else if (errorMessage.includes("Invalid item ID")) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
