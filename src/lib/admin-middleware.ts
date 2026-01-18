import { isDev } from '@/lib/config/env';
import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { auditLogger } from './audit-logger';
import type { AuthenticatedRequest } from './auth-middleware';
import { createAuthErrorResponse, withAuth } from './auth-middleware';
import { getClientIp } from './request-utils';
import { securityIntegration } from './securityIntegration';
import { constructSignedMessage, verifySignature } from './signature-verification';

// Hardcoded Admin Wallet (Must match env var or use directly here)
// Hardcoded Admin Wallet (Must match env var or use directly here)
const ADMIN_WALLET_ADDRESS = process.env["NEXT_PUBLIC_ADMIN_WALLET_ADDRESS"];
const ALLOWED_ADMIN_IPS = (process.env["ALLOWED_ADMIN_IPS"] || "").split(",").filter(Boolean);

export interface AdminRequest extends AuthenticatedRequest {
    isAdmin: true;
    adminLevel: "standard" | "super";
}

async function verifyAdminIdentity(publicKey: string, ip: string): Promise<NextResponse | null> {
    if (!ADMIN_WALLET_ADDRESS) {
        logger.error("[AdminMiddleware] CRITICAL: NEXT_PUBLIC_ADMIN_WALLET_ADDRESS is not defined.");
        return createAuthErrorResponse({ message: "Server configuration error.", code: "ADMIN_CONFIG_ERROR", status: 500 });
    }

    if (publicKey !== ADMIN_WALLET_ADDRESS) {
        logger.warn(`[AdminMiddleware] Unauthorized access attempt by ${publicKey} from IP ${ip}`);
        await auditLogger.logEvent("SUSPICIOUS_ACTIVITY", "Unauthorized admin access attempt", { userId: publicKey, ip }, "critical");
        return createAuthErrorResponse({ message: "Unauthorized. You are not an administrator.", code: "ACCESS_DENIED", status: 403 });
    }
    return null;
}

async function verifyIpAllowlist(ip: string, publicKey: string): Promise<NextResponse | null> {
    if (ALLOWED_ADMIN_IPS.length > 0 && !ALLOWED_ADMIN_IPS.includes(ip)) {
        logger.warn(`[AdminMiddleware] Admin wallet used from unauthorized IP: ${ip}`);
        await auditLogger.logEvent("SUSPICIOUS_ACTIVITY", "Admin wallet access from unauthorized IP", { userId: publicKey, ip }, "critical");
        return createAuthErrorResponse({ message: "Access denied from this location.", code: "INVALID_IP_LOCATION", status: 403 });
    }
    return null;
}

async function handleAdminSession(request: AuthenticatedRequest, publicKey: string): Promise<NextResponse | { securityLevel: string }> {
    const secureSessionId = request.cookies.get("secure_session")?.value;
    const host = request.headers.get("host") || "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || isDev;

    if (!secureSessionId) {
        if (isDev || isLocal) {
            logger.warn(`[AdminMiddleware] ⚠️ Secure session check bypassed for ${publicKey}`);
            return { securityLevel: "localhost-bypass" };
        }
        if (request.nextUrl.pathname.startsWith("/api/")) {
            return createAuthErrorResponse({ message: "Secure session required.", code: "SECURE_SESSION_REQUIRED", status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/admin/security/enroll";
        url.searchParams.set("reason", "required");
        return NextResponse.redirect(url);
    }

    const validation = await securityIntegration.validateSession(secureSessionId, request);
    if (!validation.valid || !validation.session) {
        return createAuthErrorResponse({ message: "Invalid session.", code: "SESSION_INVALID", status: 401 });
    }

    if (validation.session.authMethod !== "biometric" && !isDev && !isLocal) {
        logger.warn(`[AdminMiddleware] Admin ${publicKey} attempted access without 2FA`);
        await auditLogger.logEvent("SESSION_VIOLATION", "Admin access rejected: Missing 2FA", { userId: publicKey }, "error");
        const url = request.nextUrl.clone();
        url.pathname = "/admin/security/enroll";
        url.searchParams.set("reason", "required");
        return NextResponse.redirect(url);
    }

    return { securityLevel: validation.session.securityLevel };
}

/**
 * Admin Middleware
 * Wrapper strictly for admin routes requiring high privileges
 */
export function withAdminAuth<T extends unknown[]>(handler: (req: AdminRequest, ...args: T) => Promise<NextResponse>) {
    return withAuth(async (request: AuthenticatedRequest, ...args: T): Promise<NextResponse> => {
        const ip = getClientIp(request);
        const publicKey = request.user.sub;

        const identityRes = await verifyAdminIdentity(publicKey, ip);
        if (identityRes) return identityRes;

        const ipRes = await verifyIpAllowlist(ip, publicKey);
        if (ipRes) return ipRes;

        const sessionRes = await handleAdminSession(request, publicKey);
        if ("status" in sessionRes || sessionRes instanceof NextResponse) return sessionRes as NextResponse;

        const { securityLevel } = sessionRes;
        (request as unknown as AdminRequest).isAdmin = true;
        (request as unknown as AdminRequest).adminLevel = "super";

        logger.log(`[AdminMiddleware] Admin access granted to ${publicKey} (Security: ${securityLevel})`);
        await auditLogger.logEvent("LOGIN_SUCCESS", "Admin access granted", { userId: publicKey, role: "ADMIN", securityLevel }, "info");

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
export function withSignedAdminAuth<T extends unknown[]>(handler: (req: AdminRequest, ...args: T) => Promise<NextResponse>) {
    return withAdminAuth(async (request: AdminRequest, ...args: T): Promise<NextResponse> => {
        const signature = request.headers.get("x-admin-signature");
        const timestamp = request.headers.get("x-admin-action-timestamp");

        if (!signature || !timestamp) {
            logger.warn("[AdminMiddleware] Missing signature headers");
            return createAuthErrorResponse({ message: "Missing cryptographic signature.", code: "SIGNATURE_MISSING", status: 400 });
        }

        const actionTime = new Date(timestamp).getTime();
        if (isNaN(actionTime) || Math.abs(Date.now() - actionTime) > 5 * 60 * 1000) {
            return createAuthErrorResponse({ message: "Signature expired or invalid.", code: "SIGNATURE_EXPIRED", status: 400 });
        }

        try {
            const bodyText = await request.clone().text();
            try {
                JSON.parse(bodyText);
            } catch {
                return createAuthErrorResponse({ message: "Invalid JSON body.", code: "INVALID_BODY", status: 400 });
            }

            if (!verifySignature(constructSignedMessage(timestamp, bodyText), signature, request.user.sub)) {
                logger.warn(`[AdminMiddleware] Invalid signature by ${request.user.sub}`);
                await auditLogger.logEvent("SUSPICIOUS_ACTIVITY", "Invalid admin signature", { userId: request.user.sub }, "critical");
                return createAuthErrorResponse({ message: "Invalid signature.", code: "SIGNATURE_INVALID", status: 403 });
            }

            return handler(request, ...args);
        } catch (error) {
            logger.error("[AdminMiddleware] Signature error:", error);
            return createAuthErrorResponse({ message: "Signature verification failed.", code: "INTERNAL_ERROR", status: 500 });
        }
    });
}
