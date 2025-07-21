import { NextResponse } from 'next/server';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // استيراد CSRF middleware
import { CSRFManager } from '@/lib/csrf-utils'; // استيراد CSRFManager
import { JWTManager } from '@/lib/jwt-utils'; // لاستخدام createSecureCookieOptions
import { initializeAdminApp } from '@/lib/firebase-admin';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  console.log("[API] /api/game/withdrawUSDT called");

  try {
    await initializeAdminApp(); // Initialize inside the handler
    const db = getFirestore();

    const userPublicKey = request.user?.sub; // Get public key from authenticated user

    if (!userPublicKey) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { amount } = await request.json();

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid withdrawal amount provided.' }, { status: 400 });
    }

    const playerDocRef = db.collection('players').doc(userPublicKey);

    // Transaction to ensure atomic read-modify-write
    const newBalance = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(playerDocRef);

      if (!docSnap.exists) {
        throw new Error('Player data not found.');
      }

      const currentBalance = docSnap.data()?.gameUSDTBalance || 0;

      if (currentBalance < amount) {
        throw new Error('Insufficient balance for withdrawal.');
      }

      const updatedBalance = currentBalance - amount;
      transaction.update(playerDocRef, {
        gameUSDTBalance: updatedBalance,
        lastInteraction: FieldValue.serverTimestamp(),
      });
      return updatedBalance;
    });

    const response = NextResponse.json({ success: true, newBalance });

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
    console.log('[withdrawUSDT] New CSRF token issued and set in cookie.');

    return response;
  } catch (error: any) {
    console.error('[withdrawUSDT] Error:', error);
    let errorMessage = error.message || 'Failed to withdraw USDT.';
    let statusCode = 500;

    if (errorMessage.includes("Firebase Admin SDK environment variables are not set correctly")) {
      errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
      statusCode = 500;
    } else if (errorMessage.includes("Authentication required")) {
      statusCode = 401;
    } else if (errorMessage.includes('Insufficient balance')) {
      statusCode = 400; // Bad Request
    } else if (errorMessage.includes('Player data not found')) {
      statusCode = 404; // Not Found
    } else if (errorMessage.includes('Invalid withdrawal amount provided')) {
      statusCode = 400;
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}));
