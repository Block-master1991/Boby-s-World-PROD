import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { randomBytes } from 'crypto';
import { JWTManager } from '@/lib/jwt-utils'; // تأكد من وجود هذا الملف وتصديره للدوال المطلوبة

const MAX_NONCE_ATTEMPTS = 3; // Max attempts to verify a specific nonce

async function generateNonce(publicKey: string): Promise<string | null> {
  console.log(`[AuthNonces] Called generateNonce for publicKey: ${publicKey}`);
  try {
    await initializeAdminApp();
    const db = getFirestore();
    console.log(`[AuthNonces] Firestore instance obtained in generateNonce.`);

    try {
      await db.collection('_internal_check').doc('connectivity_generate_nonce').get();
      console.log("[AuthNonces] Firestore connectivity check successful in generateNonce.");
    } catch (diagError: any) {
      console.error("[AuthNonces] Firestore connectivity check FAILED in generateNonce:", diagError.message, diagError.stack);
      return null;
    }

    const newNonce = randomBytes(32).toString('hex');
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    const nonceRef = db.collection('authNonces').doc(publicKey);
    console.log(`[AuthNonces] Attempting to set nonce for publicKey ${publicKey} at path: ${nonceRef.path}`);
    await nonceRef.set({
      nonce: newNonce,
      expiry: expiry,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`[AuthNonces] Successfully generated and stored nonce ${newNonce} for publicKey ${publicKey}. Expiry: ${new Date(expiry).toISOString()}`);
    return newNonce;
  } catch (error: any) {
    console.error(`[AuthNonces] Error in generateNonce for publicKey ${publicKey}:`, error.message, error.stack);
    return null;
  }
}

async function verifyAndConsumeNonce(publicKey: string, clientNonce: string): Promise<boolean> {
  console.log(`[AuthNonces] Called verifyAndConsumeNonce for publicKey: ${publicKey}, clientNonce: ${clientNonce}`);
  try {
    await initializeAdminApp();
    const db = getFirestore();
    console.log(`[AuthNonces] Firestore instance obtained in verifyAndConsumeNonce.`);

    try {
      await db.collection('_internal_check').doc('connectivity_verify_nonce').get();
      console.log("[AuthNonces] Firestore connectivity check successful in verifyAndConsumeNonce.");
    } catch (diagError: any) {
      console.error("[AuthNonces] Firestore connectivity check FAILED in verifyAndConsumeNonce:", diagError.message, diagError.stack);
      return false;
    }

    const nonceRef = db.collection('authNonces').doc(publicKey);
    console.log(`[AuthNonces] Nonce reference for transaction: ${nonceRef.path}`);

    const result = await db.runTransaction(async (transaction) => {
      console.log(`[AuthNonces] Starting transaction for publicKey: ${publicKey}`);
      const nonceDoc = await transaction.get(nonceRef);

      if (!nonceDoc.exists) {
        console.warn(`[AuthNonces] Nonce entry not found for publicKey: ${publicKey} during transaction.`);
        return { success: false, reason: 'not_found' };
      }

      const storedData = nonceDoc.data() as { nonce: string; expiry: number; attempts: number };
      console.log(`[AuthNonces] Nonce data found for ${publicKey}: attempts=${storedData.attempts}, expiry=${new Date(storedData.expiry).toISOString()}`);

      if (storedData.expiry < Date.now()) {
        console.warn(`[AuthNonces] Nonce expired for publicKey: ${publicKey}. Deleting.`);
        transaction.delete(nonceRef);
        return { success: false, reason: 'expired' };
      }

      const currentAttempts = storedData.attempts || 0;
      
      if (storedData.nonce !== clientNonce) {
        const newAttempts = currentAttempts + 1;
        console.warn(`[AuthNonces] Nonce mismatch for publicKey: ${publicKey}. Expected: ${storedData.nonce}, Got: ${clientNonce}. Attempt ${newAttempts}/${MAX_NONCE_ATTEMPTS}.`);
        if (newAttempts >= MAX_NONCE_ATTEMPTS) {
          console.warn(`[AuthNonces] Too many attempts for nonce on publicKey ${publicKey} (nonce mismatch). Deleting.`);
          transaction.delete(nonceRef);
          return { success: false, reason: 'too_many_attempts_mismatch' };
        }
        console.log(`[AuthNonces] Updating attempts to ${newAttempts} for publicKey ${publicKey}.`);
        transaction.update(nonceRef, { attempts: newAttempts });
        return { success: false, reason: 'mismatch' };
      }

      console.log(`[AuthNonces] Nonce verified for publicKey: ${publicKey}. Consuming (deleting).`);
      transaction.delete(nonceRef);
      return { success: true, reason: 'consumed' };
    });

    console.log(`[AuthNonces] Transaction result for ${publicKey}: Success=${result.success}, Reason=${result.reason}`);
    return result.success;

  } catch (error: any) {
    console.error(`[AuthNonces] Transaction error for publicKey ${publicKey}:`, error.message, error.stack);
    return false;
  }
}


export async function GET(request: Request) {
    console.log('[GET /api/auth/login] Received request for nonce generation.');
    try {
        await initializeAdminApp();
        const dbForCheck = getFirestore();

        try {
            await dbForCheck.collection('_internal_check').doc('init_get_login').get();
            console.log("[GET /api/auth/login] Firestore connectivity check successful after global init.");
        } catch (diagError: any) {
            console.error("[GET /api/auth/login] Initial Firestore connectivity check FAILED:", diagError.message, diagError.stack);
            return NextResponse.json({ error: 'Server configuration error with database.', details: 'Connectivity check failed (GET Login).' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const publicKey = searchParams.get('publicKey');

        if (!publicKey) {
            console.warn('[GET /api/auth/login] Public key is required in query params.');
            return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
        }
        console.log(`[GET /api/auth/login] Processing nonce request for publicKey: ${publicKey}`);

        try {
            new PublicKey(publicKey);
        } catch (pkError: any) {
            console.warn(`[GET /api/auth/login] Invalid public key format: ${publicKey}`, pkError.message);
            return NextResponse.json({ error: 'Invalid public key format' }, { status: 400 });
        }
        
        const nonce = await generateNonce(publicKey);
        if (!nonce) {
            console.error(`[GET /api/auth/login] Failed to generate nonce for publicKey: ${publicKey}. This is a server-side issue. Check [AuthNonces] logs for details.`);
            return NextResponse.json({ error: 'Failed to generate nonce, server-side issue. Possible Firestore connectivity or permission problem.' }, { status: 500 });
        }
        
        console.log(`[GET /api/auth/login] Nonce generated successfully for ${publicKey}: ${nonce}.`);
        return NextResponse.json({ nonce });

    } catch (error: any) {
        console.error('[GET /api/auth/login] Outer error handler:', error);
        let responseError = 'Failed to process nonce request due to server error.';
        let responseDetails = 'Internal server error';
        if (process.env.NODE_ENV === 'development') {
            responseError = typeof error.message === 'string' ? error.message : responseError;
            responseDetails = error.stack || String(error);
        }
        return NextResponse.json({ error: responseError, details: responseDetails }, { status: 500 });
    }
}


export async function POST(request: Request) {
  console.log('[LOGIN] Received login request');
  let db;

  // استخرج publicKey من الطلب إذا كان متاحًا
  const { publicKey } = await request.json().catch(() => ({}));

  
  try {
    await initializeAdminApp();
    db = getFirestore();

    // Firestore connectivity check
    try {
      await db.collection('_internal_check').doc('init_post_login_jwt').get();
    } catch (diagError: any) {
      return NextResponse.json({ error: 'Server configuration error with database.', details: 'Connectivity check failed (POST Login JWT).' }, { status: 500 });
    }

    const { publicKey, signature, nonce: clientNonce } = await request.json();

    if (!publicKey || !signature || !clientNonce) {
      return NextResponse.json({ error: 'publicKey, signature, and clientNonce are required' }, { status: 400 });
    }

    try {
      new PublicKey(publicKey);
    } catch {
      return NextResponse.json({ error: 'Invalid public key format' }, { status: 400 });
    }

    console.log('[LOGIN] Parsed body:', { publicKey, signature, clientNonce });

    // تحقق من nonce
    const nonceIsValid = await verifyAndConsumeNonce(publicKey, clientNonce);
    if (!nonceIsValid) {
      return NextResponse.json({ error: 'Invalid, expired, or already used nonce.' }, { status: 403 });
    }
    console.log('[LOGIN] Nonce verification result:', nonceIsValid);


    // تحقق من التوقيع
    console.log('[LOGIN] Verifying signature...');
    const messageToVerify = `Sign this message to authenticate with Boby's World.\nNonce: ${clientNonce}`;
    const messageBytes = new TextEncoder().encode(messageToVerify);
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'hex'));

    const isVerified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!isVerified) {
      console.warn('[LOGIN] Signature verification failed');
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
    } else {
      console.log('[LOGIN] Signature verified successfully');
    }

    // إنشاء أو تحديث player doc
    console.log('[LOGIN] Creating/updating player doc in Firestore...');
    try {
      const playerRef = db.collection('players').doc(publicKey);
      const playerDoc = await playerRef.get();
      if (!playerDoc.exists) {
        await playerRef.set({
          walletAddress: publicKey,
          createdAt: FieldValue.serverTimestamp(),
          lastLogin: FieldValue.serverTimestamp(),
          inventory: [],
          gameUSDTBalance: 0,
        });
      } else {
        await playerRef.update({ lastLogin: FieldValue.serverTimestamp() });
      }
    } catch (dbError: any) {
      // لا توقف العملية إذا فشل التحديث
      console.error('[POST /api/auth/login] JWT FLOW - Error creating/updating player doc:', dbError.message, dbError.stack);
    }

    // === إصدار JWTs ===
    console.log('[LOGIN] Issuing JWTs for:', publicKey);
    const accessToken = JWTManager.createAccessToken(publicKey, clientNonce);
    const refreshToken = JWTManager.createRefreshToken(publicKey);

    // إعداد الكوكيز الآمنة
    console.log('[LOGIN] Setting cookies for accessToken and refreshToken');
    const response = NextResponse.json({
      success: true,
      message: 'Signature verified successfully. JWTs issued.',
      publicKey
    });
    response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60));
    response.cookies.set('refreshToken', refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60));

    // نهاية العملية
    console.log('[LOGIN] Login process completed successfully');
    return response;

  } catch (error: any) {
    let responseError = 'Authentication failed (JWT Flow)';
    let responseDetails = 'Internal server error. Check server logs for more details.';

    if (process.env.NODE_ENV === 'development') {
      if (error && typeof error.message === 'string' && error.message.trim() !== '') {
        responseError = error.message.trim();
      } else if (typeof error === 'string' && error.trim() !== '') {
        responseError = error.trim();
      }
      responseDetails = error?.stack || String(error);
    }

    return NextResponse.json({
      error: responseError,
      details: responseDetails
    }, { status: 500 });
  }
}


