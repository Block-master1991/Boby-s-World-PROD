import { AdvancedRateLimiter } from '@/lib/advancedRateLimiter';
import { sessionManager } from '@/lib/advancedSessionManager';
import { auditLogger } from '@/lib/audit-logger';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { JWTManager } from '@/lib/jwt-utils';
import { getClientIp } from '@/lib/request-utils';
import { securityIntegration } from '@/lib/securityIntegration';
import { LoginRequestSchema, validateRequestBody } from '@/lib/validation-schemas';
import { logger } from '@/utils/logger';
import { PublicKey } from '@solana/web3.js';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import { createOrUpdatePlayerDoc, ensureFirestoreConnectivity, generateNonce, sha256Base64, validatePublicKey, verifyAndConsumeNonce } from './loginHelpers';

export async function GET(request: Request) {
    logger.log('[GET /api/auth/login] Received request for nonce generation.');
    try {
        const initError = await ensureFirestoreConnectivity('init_get_login');
        if (initError) return initError;

        const publicKey = new URL(request.url).searchParams.get('publicKey');
        if (!publicKey) return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
        if (!validatePublicKey(publicKey)) return NextResponse.json({ error: 'Invalid public key format' }, { status: 400 });

        const nonce = await generateNonce(publicKey);
        if (!nonce) return NextResponse.json({ error: 'Failed to generate nonce, server-side issue.' }, { status: 500 });

        logger.log(`[GET /api/auth/login] Nonce generated for ${publicKey}: ${nonce}.`);
        return NextResponse.json({ nonce });
    } catch (error) {
        logger.error('[GET /api/auth/login] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Failed to process nonce request.' }, { status: 500 });
    }
}

async function handleRateLimit(request: Request, ip: string): Promise<NextResponse | null> {
    const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(request, ip, { 
        endpoint: 'login-attempt', 
        options: { customLimit: 10 } 
    });
    if (!rateLimitResult.allowed) {
        logger.warn(`[LOGIN] Rate limit exceeded for IP ${ip}`);
        await auditLogger.logRateLimitHit(`IP:${ip}`, '/api/auth/login', { ip });
        return NextResponse.json({ error: 'Too many login attempts. Please try again later.', retryAfter: rateLimitResult.retryAfter }, { status: 429 });
    }
    return null;
}

async function handleNonceVerification(publicKey: string, clientNonce: string, ip: string): Promise<NextResponse | null> {
    const nonceResult = await verifyAndConsumeNonce(publicKey, clientNonce);
    if (!nonceResult.success) {
        if (nonceResult.reason === 'too_many_attempts' || nonceResult.reason === 'too_many_attempts_mismatch') {
            await auditLogger.logLoginFailure({ publicKey, ip }, 'Too many nonce attempts');
            const response = NextResponse.json({ error: 'Too many login attempts. Session terminated.' }, { status: 403 });
            response.cookies.set('accessToken', '', { maxAge: 0, path: '/' });
            response.cookies.set('refreshToken', '', { maxAge: 0, path: '/' });
            return response;
        }
        await auditLogger.logLoginFailure({ publicKey, ip, reason: nonceResult.reason }, 'Invalid nonce');
        const newNonce = await generateNonce(publicKey);
        return NextResponse.json({ error: 'Invalid nonce. Please retry.', nonce: newNonce }, { status: 400 });
    }
    return null;
}

function verifySignature(publicKey: string, signature: string, clientNonce: string): boolean {
    const messageToVerify = `Sign this message to authenticate with Boby World.\nNonce: ${clientNonce}`;
    const messageBytes = new TextEncoder().encode(messageToVerify);
    const publicKeyBytes = new PublicKey(publicKey).toBytes();
    const signatureBytes = new Uint8Array(Buffer.from(signature, 'hex'));
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}

interface TokenSessionParams { publicKey: string; clientNonce: string; ipHash: string; userAgentHash: string; }

async function issueTokensAndSession(request: Request, params: TokenSessionParams): Promise<NextResponse> {
    const { publicKey, clientNonce, ipHash, userAgentHash } = params;
    const requestHost = request.headers.get('host') || '';
    const accessToken = JWTManager.createAccessToken({ publicKey, nonce: clientNonce, userAgentHash, ipHash });
    const refreshToken = JWTManager.createRefreshToken({ publicKey, nonce: clientNonce, userAgentHash, ipHash });

    const response = NextResponse.json({ success: true, message: 'Signature verified successfully. JWTs issued.', publicKey });
    response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
    response.cookies.set('refreshToken', refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));
    response.cookies.set('nonce', clientNonce, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));

    const deviceInfo = securityIntegration.extractDeviceInfo(request);
    const secureSession = await sessionManager.createSecureSession(publicKey, deviceInfo);
    if (secureSession) {
        const cookieOptions = JWTManager.createSecureCookieOptions(30 * 60, requestHost);
        response.cookies.set('secure_session', secureSession.sessionId, { ...cookieOptions, httpOnly: true });
        response.cookies.set('session_seed', secureSession.currentSeed, { ...cookieOptions, httpOnly: true });
        logger.log(`[LOGIN] Secure session created: ${secureSession.sessionId}`);
    }

    await auditLogger.logLoginSuccess(publicKey, { ip: getClientIp(request), userAgent: request.headers.get('user-agent') || 'unknown' });
    return setCsrfTokenResponse(response, publicKey, requestHost);
}

export async function POST(request: Request) {
    logger.log('[LOGIN] Received login request');
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ipHash = sha256Base64(ip);
    const userAgentHash = sha256Base64(userAgent);

    const rateLimitError = await handleRateLimit(request, ip);
    if (rateLimitError) return rateLimitError;

    try {
        const initError = await ensureFirestoreConnectivity('init_post_login_jwt');
        if (initError) return initError;

        let validatedBody: { publicKey: string; signature: string; nonce: string };
        try {
            validatedBody = await validateRequestBody(request, LoginRequestSchema);
        } catch (validationError) {
            const msg = validationError instanceof Error ? validationError.message : 'Validation failed';
            logger.warn(`[LOGIN] Validation failed: ${msg}`);
            return NextResponse.json({ error: msg }, { status: 400 });
        }

        const { publicKey, signature, nonce: clientNonce } = validatedBody;
        logger.log('[LOGIN] Parsed body:', { publicKey, signature: `${signature.slice(0, 20)  }...`, clientNonce });

        const nonceError = await handleNonceVerification(publicKey, clientNonce, ip);
        if (nonceError) return nonceError;
        logger.log('[LOGIN] Nonce verification: success');

        logger.log('[LOGIN] Verifying signature...');
        if (!verifySignature(publicKey, signature, clientNonce)) {
            await auditLogger.logLoginFailure({ publicKey, ip }, 'Invalid signature');
            return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
        }
        logger.log('[LOGIN] Signature verified successfully');

        const db = getFirestore();
        await createOrUpdatePlayerDoc(db, publicKey);

        logger.log('[LOGIN] Issuing JWTs for:', publicKey);
        return issueTokensAndSession(request, { publicKey, clientNonce, ipHash, userAgentHash });
    } catch (error) {
        logger.error('[LOGIN] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
