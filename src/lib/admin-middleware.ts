import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import type { AuthenticatedRequest} from './auth-middleware';
import { createAuthErrorResponse, withAuth } from './auth-middleware';
import { securityIntegration } from './securityIntegration';
import { auditLogger } from './audit-logger';
import { getClientIp } from './request-utils';
import { verifySignature, constructSignedMessage } from './signature-verification';

// Hardcoded Admin Wallet (Must match env var or use directly here)
const ADMIN_WALLET_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS;
const ALLOWED_ADMIN_IPS = process.env.ALLOWED_ADMIN_IPS ? process.env.ALLOWED_ADMIN_IPS.split(',') : []; // Optional: List of allowed IPs

export interface AdminRequest extends AuthenticatedRequest {
    isAdmin: true;
    adminLevel: 'standard' | 'super';
}

/**
 * Admin Middleware
 * Wrapper strictly for admin routes requiring high privileges
 */
export function withAdminAuth(handler: (req: AdminRequest, ...args: any[]) => Promise<NextResponse>) {
    return withAuth(async (request: AuthenticatedRequest, ...args: any[]): Promise<NextResponse> => {
        const ip = getClientIp(request);
        const userPublicKey = request.user.sub; // JWT uses 'sub' as the primary identifier (publicKey)

        // 1. Verify Wallet Identity
        if (!ADMIN_WALLET_ADDRESS) {
            logger.error('[AdminMiddleware] CRITICAL: NEXT_PUBLIC_ADMIN_WALLET_ADDRESS is not defined.');
            return createAuthErrorResponse('Server configuration error.', 'ADMIN_CONFIG_ERROR', 500);
        }

        if (userPublicKey !== ADMIN_WALLET_ADDRESS) {
            logger.warn(`[AdminMiddleware] Unauthorized access attempt by ${userPublicKey} from IP ${ip}`);
            await auditLogger.logEvent(
                'SUSPICIOUS_ACTIVITY',
                `Unauthorized admin access attempt`,
                { userId: userPublicKey, ip, endpoint: request.nextUrl.pathname },
                'critical'
            );
            return createAuthErrorResponse('Unauthorized. You are not an administrator.', 'ACCESS_DENIED', 403);
        }

        // 2. IP Allowlist Verification (Optional but recommended)
        if (ALLOWED_ADMIN_IPS.length > 0 && !ALLOWED_ADMIN_IPS.includes(ip)) {
            logger.warn(`[AdminMiddleware] Admin wallet used from unauthorized IP: ${ip}`);
            await auditLogger.logEvent(
                'SUSPICIOUS_ACTIVITY',
                `Admin wallet access from unauthorized IP`,
                { userId: userPublicKey, ip, endpoint: request.nextUrl.pathname },
                'critical'
            );
            return createAuthErrorResponse('Access denied from this location.', 'INVALID_IP_LOCATION', 403);
        }

        // 3. Security Level Verification (Phase 2: Mandatory 2FA)
        const secureSessionId = request.cookies.get('secure_session')?.value;
        const isDev = process.env.NODE_ENV === 'development';
        const isApiRequest = request.nextUrl.pathname.startsWith('/api/');

        // Also allow localhost bypass in production mode for local testing
        const host = request.headers.get('host') || '';
        const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

        if (!secureSessionId) {
            if (isDev || isLocalhost) {
                logger.warn(`[AdminMiddleware] ⚠️ Secure session check bypassed for ${userPublicKey} (${isDev ? 'Development' : 'Localhost'})`);
            } else if (isApiRequest) {
                return createAuthErrorResponse('Secure session required. Please enroll a passkey.', 'SECURE_SESSION_REQUIRED', 403);
            } else {
                const url = request.nextUrl.clone();
                url.pathname = '/admin/security/enroll';
                url.searchParams.set('reason', 'required');
                return NextResponse.redirect(url);
            }
        }

        let securityLevel = 'standard';

        if (secureSessionId) {
            const validation = await securityIntegration.validateSession(secureSessionId, request);

            if (!validation.valid || !validation.session) {
                return createAuthErrorResponse('Invalid session.', 'SESSION_INVALID', 401);
            }

            // ENFORCE BIOMETRIC AUTH
            if (validation.session.authMethod !== 'biometric') {
                if (isDev || isLocalhost) {
                    logger.warn(`[AdminMiddleware] ⚠️ 2FA Bypassed for ${userPublicKey} (${isDev ? 'Development' : 'Localhost'})`);
                    // Proceed without returning error
                } else {
                    logger.warn(`[AdminMiddleware] Admin ${userPublicKey} attempted access without 2FA`);
                    await auditLogger.logEvent(
                        'SESSION_VIOLATION',
                        `Admin access rejected: Missing 2FA`,
                        { userId: userPublicKey, securityLevel: validation.session.securityLevel },
                        'error'
                    );
                    const url = request.nextUrl.clone();
                    url.pathname = '/admin/security/enroll';
                    url.searchParams.set('reason', 'required');
                    return NextResponse.redirect(url);
                }
            }

            securityLevel = validation.session.securityLevel;
        } else if (isDev || isLocalhost) {
            securityLevel = 'localhost-bypass';
        }

        // Inject Admin Metadata
        (request as unknown as AdminRequest).isAdmin = true;
        (request as unknown as AdminRequest).adminLevel = 'super'; // Can be expanded

        logger.log(`[AdminMiddleware] Admin access granted to ${userPublicKey} (Security: ${securityLevel})`);

        // Log successful admin access
        await auditLogger.logEvent(
            'LOGIN_SUCCESS',
            `Admin access granted`,
            { userId: userPublicKey, role: 'ADMIN', securityLevel, endpoint: request.nextUrl.pathname },
            'info'
        );

        return handler(request as unknown as AdminRequest, ...args);
    });
}

/**
 * Admin Middleware with Cryptographic Signature Verification
 * For CRITICAL actions (e.g., money transfers, bans, data deletions)
 * Requires headers:
 * - x-admin-signature: Base58 signature of "timestamp.body_json"
 * - x-admin-action-timestamp: ISO timestamp
 */
export function withSignedAdminAuth(handler: (req: AdminRequest, ...args: any[]) => Promise<NextResponse>) {
    return withAdminAuth(async (request: AdminRequest, ...args: any[]): Promise<NextResponse> => {
        const signature = request.headers.get('x-admin-signature');
        const timestamp = request.headers.get('x-admin-action-timestamp');

        if (!signature || !timestamp) {
            logger.warn('[AdminMiddleware] Missing signature headers for critical action');
            return createAuthErrorResponse('Missing cryptographic signature.', 'SIGNATURE_MISSING', 400);
        }

        // Verify timestamp freshness (e.g., within 5 minutes)
        const actionTime = new Date(timestamp).getTime();
        const now = Date.now();
        if (isNaN(actionTime) || Math.abs(now - actionTime) > 5 * 60 * 1000) {
            return createAuthErrorResponse('Signature expired or invalid timestamp.', 'SIGNATURE_EXPIRED', 400);
        }

        try {
            // Read body mainly for verification (cloning is necessary if we consume it)
            // But Next.js Request body can often effectively be read multiple times if we just clone it
            // or we accept that logic here consumes it. Ideally, we pass the parsed body to the handler.
            // A common pattern is: read text -> verify -> create new Request with text -> pass to handler.
            // However, handler expecting `req.json()` might fail if body is consumed.
            // Let's rely on request.clone().text() which is safe in edge/node.
            const bodyText = await request.clone().text();
            let body;
            try {
                body = JSON.parse(bodyText);
            } catch (e) {
                // If body isn't JSON, we can verify raw text or fail. Assume JSON for admin actions.
                return createAuthErrorResponse('Invalid JSON body.', 'INVALID_BODY', 400);
            }

            const message = constructSignedMessage(timestamp, bodyText); // Use raw text to ensure exact match
            const userPublicKey = request.user.sub;

            if (!verifySignature(message, signature, userPublicKey)) {
                logger.warn(`[AdminMiddleware] Invalid signature by ${userPublicKey}`);
                await auditLogger.logEvent(
                    'SUSPICIOUS_ACTIVITY',
                    `Invalid cryptographic signature on admin action`,
                    { userId: userPublicKey, endpoint: request.nextUrl.pathname },
                    'critical'
                );
                return createAuthErrorResponse('Invalid signature.', 'SIGNATURE_INVALID', 403);
            }

            // Signature valid, proceed
            return handler(request, ...args);

        } catch (error) {
            logger.error('[AdminMiddleware] Error verifying signed action:', error);
            return createAuthErrorResponse('Signature verification failed.', 'INTERNAL_ERROR', 500);
        }
    });
}
