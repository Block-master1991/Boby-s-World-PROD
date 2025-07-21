import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // استيراد CSRF middleware
import { CSRFManager } from '@/lib/csrf-utils'; // استيراد CSRFManager
import { JWTManager } from '@/lib/jwt-utils'; // لاستخدام createSecureCookieOptions
import { initializeAdminApp } from '@/lib/firebase-admin'; // استيراد db و initializeAdminApp

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/useItem called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user?.sub; // Get public key from authenticated user

    if (!userPublicKey) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { itemId, amount } = await request.json();

    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json({ error: 'Item ID is required and must be a string.' }, { status: 400 });
    }
    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json({ error: 'Amount is required and must be a positive integer.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);
    const docSnap = await playerDocRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
    }

    const data = docSnap.data()!;
    let inventory = data.inventory || [];

    // Count how many of the requested item the player actually has
    const currentItemCount = inventory.filter((entry: any) => entry?.id === itemId).length;

    if (currentItemCount < amount) {
      return NextResponse.json({ error: `You do not have enough ${itemId} to use. You have ${currentItemCount}, but requested ${amount}.` }, { status: 400 });
    }

    // Remove 'amount' number of items from the inventory
    let itemsRemoved = 0;
    const newInventory = [];
    for (const entry of inventory) {
      if (entry?.id === itemId && itemsRemoved < amount) {
        itemsRemoved++;
      } else {
        newInventory.push(entry);
      }
    }
    inventory = newInventory;

    await playerDocRef.update({
      inventory,
      lastInteraction: FieldValue.serverTimestamp(),
    });

    const response = NextResponse.json({ success: true, itemsUsed: itemsRemoved });

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
    console.log('[useItem] New CSRF token issued and set in cookie.');

    return response;
  } catch (error: any) {
    console.error('[useItem] Error:', error);
    let errorMessage = error.message || 'Failed to use item.';
    let statusCode = 500;

    // إذا كان الخطأ يشير إلى عدم تهيئة Firebase، فقم بمعالجته بشكل خاص
    if (errorMessage.includes("Firebase Admin SDK not initialized")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes("Item ID is required") || errorMessage.includes("Amount is required") || errorMessage.includes("You do not have enough")) {
      statusCode = 400;
    } else if (errorMessage.includes("Player not found")) {
      statusCode = 404;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
