import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { randomBytes } from 'crypto';
import { JWTManager } from '@/lib/jwt-utils'; // Ensure this file exists and exports the required functions
import { createHash } from 'crypto';
import { getClientIp } from '@/lib/request-utils';
import { securityIntegration } from '@/lib/securityIntegration';
import { sessionManager } from '@/lib/advancedSessionManager';
import { AdvancedRateLimiter } from '@/lib/advancedRateLimiter';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { validateRequestBody, LoginRequestSchema } from '@/lib/validation-schemas';
import { auditLogger } from '@/lib/audit-logger';
import { logger } from '@/utils/logger';


const MAX_NONCE_ATTEMPTS = 3; // Max attempts to verify a specific nonce


function sha256Base64(input: string): string {
  return createHash('sha256').update(input).digest('base64');
}

async function generateNonce(publicKey: string): Promise<string | null> {
  logger.log(`[AuthNonces] Called generateNonce for publicKey: ${publicKey}`);
  try {
    await initializeAdminApp();
    const db = getFirestore();
    logger.log(`[AuthNonces] Firestore instance obtained in generateNonce.`);

    try {
      await db.collection('_internal_check').doc('connectivity_generate_nonce').get();
      logger.log("[AuthNonces] Firestore connectivity check successful in generateNonce.");
    } catch (diagError) {
      const errorMessage = diagError instanceof Error ? diagError.message : 'An unknown error occurred';
      const errorStack = diagError instanceof Error ? diagError.stack : '';
      logger.error("[AuthNonces] Firestore connectivity check FAILED in generateNonce:", new Error(errorMessage));
      return null;
    }

    const newNonce = randomBytes(32).toString('hex');
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    const nonceRef = db.collection('authNonces').doc(publicKey);
    logger.log(`[AuthNonces] Attempting to set nonce for publicKey ${publicKey} at path: ${nonceRef.path}`);

    // Clean up any existing nonce first
    const existingNonce = await nonceRef.get();
    if (existingNonce.exists) {
      logger.log(`[AuthNonces] Found existing nonce for publicKey ${publicKey}, deleting it first.`);
      await nonceRef.delete();
    }

    // Then generate new nonce
    await nonceRef.set({
      nonce: newNonce,
      expiry: expiry,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
    logger.log(`[AuthNonces] Successfully generated and stored nonce ${newNonce} for publicKey ${publicKey}. Expiry: ${new Date(expiry).toISOString()}`);
    return newNonce;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`[AuthNonces] Error in generateNonce for publicKey ${publicKey}:`, new Error(errorMessage));
    return null;
  }
}

async function verifyAndConsumeNonce(publicKey: string, clientNonce: string): Promise<{ success: boolean; reason: string }> {
  logger.log(`[AuthNonces] Called verifyAndConsumeNonce for publicKey: ${publicKey}, clientNonce: ${clientNonce}`);
  try {
    await initializeAdminApp();
    const db = getFirestore();
    logger.log(`[AuthNonces] Firestore instance obtained in verifyAndConsumeNonce.`);

    try {
      await db.collection('_internal_check').doc('connectivity_verify_nonce').get();
      logger.log("[AuthNonces] Firestore connectivity check successful in verifyAndConsumeNonce.");
    } catch (diagError) {
      const errorMessage = diagError instanceof Error ? diagError.message : 'An unknown error occurred';
      const errorStack = diagError instanceof Error ? diagError.stack : '';
      logger.error("[AuthNonces] Firestore connectivity check FAILED in verifyAndConsumeNonce:", new Error(errorMessage));
      return { success: false, reason: 'firestore_connectivity_failed' };
    }

    const nonceRef = db.collection('authNonces').doc(publicKey);
    logger.log(`[AuthNonces] Nonce reference for transaction: ${nonceRef.path}`);

    const result = await db.runTransaction(async (transaction) => {
      logger.log(`[AuthNonces] Starting transaction for publicKey: ${publicKey}`);
      const nonceDoc = await transaction.get(nonceRef);

      if (!nonceDoc.exists) {
        logger.warn(`[AuthNonces] Nonce entry not found for publicKey: ${publicKey} during transaction.`);
        return { success: false, reason: 'not_found' };
      }

      const storedData = nonceDoc.data() as { nonce: string; expiry: number; attempts: number };
      logger.log(`[AuthNonces] Nonce data found for ${publicKey}: attempts=${storedData.attempts}, expiry=${new Date(storedData.expiry).toISOString()}`);

      if (storedData.attempts >= MAX_NONCE_ATTEMPTS) {
        logger.warn(`[AuthNonces] Too many attempts for nonce on publicKey ${publicKey}. Deleting.`);
        transaction.delete(nonceRef);
        return { success: false, reason: 'too_many_attempts' };
      }

      if (storedData.expiry < Date.now()) {
        logger.warn(`[AuthNonces] Nonce expired for publicKey: ${publicKey}. Deleting.`);
        transaction.delete(nonceRef);
        return { success: false, reason: 'expired' };
      }

      const currentAttempts = storedData.attempts || 0;

      if (storedData.nonce !== clientNonce) {
        const newAttempts = currentAttempts + 1;
        logger.warn(`[AuthNonces] Nonce mismatch for publicKey: ${publicKey}. Expected: ${storedData.nonce}, Got: ${clientNonce}. Attempt ${newAttempts}/${MAX_NONCE_ATTEMPTS}.`);
        if (newAttempts >= MAX_NONCE_ATTEMPTS) {
          logger.warn(`[AuthNonces] Too many attempts for nonce on publicKey ${publicKey} (nonce mismatch). Deleting.`);
          transaction.delete(nonceRef);
          return { success: false, reason: 'too_many_attempts_mismatch' };
        }
        logger.log(`[AuthNonces] Updating attempts to ${newAttempts} for publicKey ${publicKey}.`);
        transaction.update(nonceRef, { attempts: newAttempts });
        return { success: false, reason: 'mismatch' };
      }

      logger.log(`[AuthNonces] Nonce verified for publicKey: ${publicKey}. Consuming (deleting).`);
      transaction.delete(nonceRef);
      return { success: true, reason: 'consumed' };
    });

    logger.log(`[AuthNonces] Transaction result for ${publicKey}: Success=${result.success}, Reason=${result.reason}`);
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error(`[AuthNonces] Transaction error for publicKey ${publicKey}:`, new Error(errorMessage));
    return { success: false, reason: 'transaction_error' };
  }
}


export async function GET(request: Request) {
  logger.log('[GET /api/auth/login] Received request for nonce generation.');
  try {
    await initializeAdminApp();
    const dbForCheck = getFirestore();

    try {
      await dbForCheck.collection('_internal_check').doc('init_get_login').get();
      logger.log("[GET /api/auth/login] Firestore connectivity check successful after global init.");
    } catch (diagError) {
      const errorMessage = diagError instanceof Error ? diagError.message : 'An unknown error occurred';
      const errorStack = diagError instanceof Error ? diagError.stack : '';
      logger.error("[GET /api/auth/login] Initial Firestore connectivity check FAILED:", new Error(errorMessage));
      return NextResponse.json({ error: 'Server configuration error with database.', details: 'Connectivity check failed (GET Login).' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const publicKey = searchParams.get('publicKey');

    if (!publicKey) {
      logger.warn('[GET /api/auth/login] Public key is required in query params.');
      return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
    }
    logger.log(`[GET /api/auth/login] Processing nonce request for publicKey: ${publicKey}`);

    try {
      new PublicKey(publicKey);
    } catch (pkError) {
      const errorMessage = pkError instanceof Error ? pkError.message : 'An unknown error occurred';
      logger.warn(`[GET /api/auth/login] Invalid public key format: ${publicKey}`, errorMessage);
      return NextResponse.json({ error: 'Invalid public key format' }, { status: 400 });
    }

    const nonce = await generateNonce(publicKey);
    if (!nonce) {
      logger.error(`[GET /api/auth/login] Failed to generate nonce for publicKey: ${publicKey}. This is a server-side issue. Check [AuthNonces] logs for details.`, new Error('Nonce generation failed'));
      return NextResponse.json({ error: 'Failed to generate nonce, server-side issue. Possible Firestore connectivity or permission problem.' }, { status: 500 });
    }

    logger.log(`[GET /api/auth/login] Nonce generated successfully for ${publicKey}: ${nonce}.`);
    return NextResponse.json({ nonce });

  } catch (error) {
    logger.error('[GET /api/auth/login] Outer error handler:', error as Error);
    let responseError = 'Failed to process nonce request due to server error.';
    let responseDetails = 'Internal server error';
    if (process.env.NODE_ENV === 'development') {
      responseError = error instanceof Error ? error.message : responseError;
      responseDetails = error instanceof Error ? (error.stack || 'No stack trace available') : String(error);

    }
    return NextResponse.json({ error: responseError, details: responseDetails }, { status: 500 });
  }
}


export async function POST(request: Request) {
  logger.log('[LOGIN] Received login request');
  let db;

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ipHash = sha256Base64(ip);
  const userAgentHash = sha256Base64(userAgent);

  // 1. Pre-auth Rate Limiting
  const checkIp = getClientIp(request);
  const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(
    request,
    checkIp,
    'login-attempt',
    undefined,
    { customLimit: 10 } // Strict limit for login attempts
  );

  if (!rateLimitResult.allowed) {
    logger.warn(`[LOGIN] Rate limit exceeded for IP ${checkIp}`);
    await auditLogger.logRateLimitHit(`IP:${checkIp}`, '/api/auth/login', { ip: checkIp });
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.', retryAfter: rateLimitResult.retryAfter },
      { status: 429 }
    );
  }


  try {
    await initializeAdminApp();
    db = getFirestore();

    // Firestore connectivity check
    try {
      await db.collection('_internal_check').doc('init_post_login_jwt').get();
    } catch (diagError) {
      const errorMessage = diagError instanceof Error ? diagError.message : 'An unknown error occurred';
      return NextResponse.json({ error: 'Server configuration error with database.', details: `Connectivity check failed (POST Login JWT): ${errorMessage}` }, { status: 500 });
    }

    // Use validateRequestBody schema validation
    let validatedBody;
    try {
      validatedBody = await validateRequestBody(request, LoginRequestSchema);
    } catch (validationError: any) {
      logger.warn(`[LOGIN] Validation failed: ${validationError.message}`);
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }

    const { publicKey, signature, nonce: clientNonce } = validatedBody;

    logger.log('[LOGIN] Parsed body:', { publicKey, signature, clientNonce });

    // Verify nonce
    const nonceResult = await verifyAndConsumeNonce(publicKey, clientNonce);
    if (!nonceResult.success) {
      if (nonceResult.reason === 'too_many_attempts' || nonceResult.reason === 'too_many_attempts_mismatch') {
        logger.warn('[LOGIN] Too many nonce attempts detected. Forcing logout by clearing cookies.');
        await auditLogger.logLoginFailure({ publicKey, ip }, 'Too many nonce attempts');
        const response = NextResponse.json({ error: 'Too many login attempts. Session terminated. Please login again.' }, { status: 403 });
        response.cookies.set('accessToken', '', { maxAge: 0, path: '/' });
        response.cookies.set('refreshToken', '', { maxAge: 0, path: '/' });
        return response;
      } else {
        logger.warn(`[LOGIN] Nonce verification failed for reason: ${nonceResult.reason}. Generating new one.`);
        await auditLogger.logLoginFailure({ publicKey, ip, reason: nonceResult.reason }, 'Invalid nonce');
        // Generate new nonce and let client retry
        const newNonce = await generateNonce(publicKey);
        return NextResponse.json({
          error: 'Invalid nonce. Please retry.',
          nonce: newNonce
        }, { status: 400 });
      }
    }

    logger.log('[LOGIN] Nonce verification result: success');


    // Verify signature
    logger.log('[LOGIN] Verifying signature...');
    const messageToVerify = `Sign this message to authenticate with Boby World.\nNonce: ${clientNonce}`;
    const messageBytes = new TextEncoder().encode(messageToVerify);
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'hex'));

    const isVerified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!isVerified) {
      logger.warn('[LOGIN] Signature verification failed');
      await auditLogger.logLoginFailure({ publicKey, ip }, 'Invalid signature');
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
    } else {
      logger.log('[LOGIN] Signature verified successfully');
    }

    // Create or update player doc
    logger.log('[LOGIN] Creating/updating player doc in Firestore...');
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
    } catch (dbError) {
      // Don't stop the process if update fails
      const errorMessage = dbError instanceof Error ? dbError.message : 'An unknown error occurred';
      const errorStack = dbError instanceof Error ? dbError.stack : '';
      logger.error('[POST /api/auth/login] JWT FLOW - Error creating/updating player doc:', new Error(errorMessage));
    }

    // === Issue JWTs ===
    logger.log('[LOGIN] Issuing JWTs for:', publicKey);

    const accessToken = JWTManager.createAccessToken({
      publicKey,
      nonce: clientNonce,
      userAgentHash,
      ipHash,
    });

    const refreshToken = JWTManager.createRefreshToken({
      publicKey,
      nonce: clientNonce,
      userAgentHash,
      ipHash,
    });

    // Set secure cookies
    logger.log('[LOGIN] Setting cookies for accessToken and refreshToken');
    const response = NextResponse.json({
      success: true,
      message: 'Signature verified successfully. JWTs issued.',
      publicKey
    });
    const requestHost = request.headers.get('host') || ''; // Get the Host header
    logger.log(`[LOGIN] Request Host: ${requestHost}`); // Add this log
    response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
    response.cookies.set('refreshToken', refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));
    response.cookies.set('nonce', clientNonce, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost)); // Set nonce cookie

    // === Create Secure Session (Advanced Session Manager) ===
    const deviceInfo = securityIntegration.extractDeviceInfo(request);
    const secureSession = await sessionManager.createSecureSession(publicKey, deviceInfo);
    if (secureSession) {
      const cookieOptions = JWTManager.createSecureCookieOptions(30 * 60, requestHost);
      response.cookies.set('secure_session', secureSession.sessionId, {
        ...cookieOptions,
        httpOnly: true
      });
      response.cookies.set('session_seed', secureSession.currentSeed, {
        ...cookieOptions,
        httpOnly: true
      });
      logger.log(`[LOGIN] Secure session and initial seed created: ${secureSession.sessionId}`);
    }

    // === Issue CSRF Token using helper ===
    return await setCsrfTokenResponse(response, publicKey, requestHost);

    // End of process
    logger.log('[LOGIN] Login process completed successfully');
    await auditLogger.logLoginSuccess(publicKey, { ip, userAgent });
    return response;

  } catch (error) {
    let responseError = 'Authentication failed (JWT Flow)';
    let responseDetails = 'Internal server error. Check server logs for more details.';

    if (process.env.NODE_ENV === 'development') {
      responseError = error instanceof Error ? error.message : String(error);
      responseDetails = error instanceof Error ? (error.stack || 'No stack trace available') : String(error);

    }

    return NextResponse.json({
      error: responseError,
      details: responseDetails
    }, { status: 500 });
  }
}
