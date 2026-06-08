import type { NextRequest, NextResponse } from "next/server";
import { logger } from "utils/logger";
import { auditLogger } from "./audit-logger";
import { isDev } from "./config/env";
import { JWTManager, type JWTPayload } from "./jwt-utils";
import { securityIntegration } from "./securityIntegration";
import {
  createAuthErrorResponse,
  extractAuthRequestMetadata,
  type AuthMetadata,
} from "./auth-helpers";

export { createAuthErrorResponse, extractAuthRequestMetadata, type AuthMetadata };
export {
  verifySessionOrReject,
  extractUserFromToken,
  validateTokenFromRequest,
} from "./auth-validation";

export interface AuthenticatedRequest extends NextRequest {
  user: JWTPayload;
}

interface RequestWithTokens extends NextRequest {
  _nextTokens?: { accessToken: string; newRefreshToken: string };
}

async function verifyWafRequest(request: NextRequest): Promise<NextResponse | null> {
  const { verifyCloudflareRequest } = await import("@/lib/request-utils");
  if (!verifyCloudflareRequest(request)) {
    logger.error("[AuthMiddleware] Request bypassed Cloudflare or missing edge headers.");
    return createAuthErrorResponse({
      message: "Direct access prohibited. Please use the official domain.",
      code: "WAF_BYPASS_ATTEMPT",
      status: 403,
    });
  }
  return null;
}

async function performRateLimit(
  request: NextRequest,
  metadata: AuthMetadata,
  userId?: string
): Promise<NextResponse | null> {
  const { ip, userAgent } = metadata;
  const identifier = userId || ip;
  const { AdvancedRateLimiter } = await import("./advancedRateLimiter");
  const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(request, identifier, {
    endpoint: request.nextUrl.pathname,
    deviceInfo: securityIntegration.extractDeviceInfo(request),
  });

  if (!rateLimitResult.allowed) {
    logger.warn(
      `[AuthMiddleware] Rate limit exceeded for ${userId ? `user ${userId}` : `IP ${ip}`} on path ${request.nextUrl.pathname}`
    );
    await auditLogger.logRateLimitHit(identifier, request.nextUrl.pathname, { userAgent, ip });
    return createAuthErrorResponse({
      message: "Too many requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      status: 429,
    });
  }
  return null;
}

async function handleTokenAuth(
  request: NextRequest,
  metadata: AuthMetadata
): Promise<NextResponse | { payload: JWTPayload }> {
  const { accessToken, refreshToken, userAgent, ip } = metadata;
  const payload = accessToken
    ? await JWTManager.verifyAccessToken(accessToken, userAgent, ip)
    : null;
  if (payload) {
    const storedNonce = request.cookies.get("nonce")?.value;
    if (!storedNonce || payload.nonce !== storedNonce) {
      if (!isDev) {
        logger.warn(`[AuthMiddleware] Nonce mismatch for ${payload.sub}. Revoking session.`);
        return createAuthErrorResponse({
          message: "Session nonce invalid. Please login again.",
          code: "NONCE_MISMATCH",
          status: 401,
          clearCookies: true,
        });
      }
      logger.warn(
        `[AuthMiddleware] ⚠️ Nonce mismatch bypassed in dev. Payload: ${payload.nonce}, Cookie: ${storedNonce}`
      );
    }
    return { payload };
  }
  if (!refreshToken) {
    return createAuthErrorResponse({
      message: "Authentication required.",
      code: "NO_TOKENS",
      status: 401,
      clearCookies: true,
    });
  }
  const refreshResult = await JWTManager.refreshAccessToken(refreshToken, userAgent, ip);
  if (refreshResult) {
    const newPayload = await JWTManager.verifyAccessToken(refreshResult.accessToken, userAgent, ip);
    if (newPayload) {
      (request as RequestWithTokens)._nextTokens = refreshResult;
      return { payload: newPayload };
    }
    return createAuthErrorResponse({
      message: "Session refresh failed verification.",
      code: "REFRESH_VERIFY_FAILED",
      status: 401,
      clearCookies: true,
    });
  }
  return createAuthErrorResponse({
    message: "Invalid session. Please login again.",
    code: "INVALID_OR_EXPIRED_TOKEN",
    status: 401,
    clearCookies: true,
  });
}

async function validateSecureSession(
  request: NextRequest,
  payload: JWTPayload,
  metadata: AuthMetadata
): Promise<NextResponse | { nextSeed: string | undefined }> {
  const secureSessionId = request.cookies.get("secure_session")?.value;
  if (!secureSessionId) return { nextSeed: undefined };

  const { ip, userAgent } = metadata;
  const sessionValidation = await securityIntegration.validateSession(secureSessionId, request);
  if (!sessionValidation.valid) {
    logger.log(
      `[AuthMiddleware withAuth] Stateful session validation failed: ${sessionValidation.error}`
    );
    await auditLogger.logSessionViolation(
      payload.sub,
      secureSessionId,
      sessionValidation.error || "Unknown reason",
      { userAgent, ip }
    );
    return createAuthErrorResponse({
      message: "Session revoked or suspicious. Please login again.",
      code: "SESSION_STATE_INVALID",
      status: 401,
      clearCookies: true,
    });
  }

  const isHighFreq = ["/api/game/addCoin", "/api/graphql"].some(path =>
    request.nextUrl.pathname.startsWith(path)
  );
  if (isHighFreq) return { nextSeed: undefined };

  const providedSeed = request.cookies.get("session_seed")?.value;

  if (!providedSeed) {
    if (isDev) return { nextSeed: undefined };
    return createAuthErrorResponse({
      message: "Missing security sequence seed.",
      code: "MISSING_SESSION_SEED",
      status: 401,
    });
  }

  const seedResult = await securityIntegration.validateAndRotateSeed(secureSessionId, providedSeed);
  if (!seedResult.valid) {
    if (isDev) return { nextSeed: undefined };
    return createAuthErrorResponse({
      message: "Invalid session security seed.",
      code: "INVALID_SESSION_SEED",
      status: 401,
    });
  }

  return { nextSeed: seedResult.nextSeed };
}

async function syncAuthCookies(
  response: NextResponse,
  request: NextRequest,
  payload: JWTPayload,
  nextSeed?: string
): Promise<void> {
  const requestHost = request.headers.get("host") || undefined;

  if ((request as RequestWithTokens)._nextTokens) {
    const { accessToken, newRefreshToken } = (request as RequestWithTokens)._nextTokens!;

    response.cookies.set(
      "accessToken",
      accessToken,
      JWTManager.createSecureCookieOptions(15 * 60, requestHost)
    );
    response.cookies.set(
      "refreshToken",
      newRefreshToken,
      JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost)
    );

    const { CSRFManager } = await import("@/lib/csrf-utils");
    const csrfToken = await CSRFManager.getOrCreateToken(payload.sub);
    response.cookies.set("csrfToken", csrfToken, {
      httpOnly: false,
      secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
      sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
      maxAge: 30 * 60,
      path: "/",
    });
  }

  if (nextSeed) {
    response.cookies.set(
      "session_seed",
      nextSeed,
      JWTManager.createSecureCookieOptions(30 * 60, requestHost)
    );
  }
}

export function withAuth<T extends unknown[]>(
  handler: (req: AuthenticatedRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      const wafRes = await verifyWafRequest(request);
      if (wafRes) return wafRes;

      const metadata = extractAuthRequestMetadata(request);
      const authResult = await handleTokenAuth(request, metadata);
      const userId = "payload" in authResult ? authResult.payload.sub : undefined;

      const rlRes = await performRateLimit(request, metadata, userId);
      if (rlRes) return rlRes;

      if ("status" in authResult) return authResult;

      const { payload } = authResult;
      const sessionResult = await validateSecureSession(request, payload, metadata);
      if ("status" in sessionResult) return sessionResult;

      (request as AuthenticatedRequest).user = payload;
      const response = await handler(request as AuthenticatedRequest, ...args);

      await syncAuthCookies(response, request, payload, sessionResult.nextSeed);

      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      logger.error("[AuthMiddleware withAuth] Error in middleware:", errorMessage);
      return createAuthErrorResponse({
        message: "Authentication processing error.",
        code: "AUTH_MIDDLEWARE_ERROR",
        status: 500,
      });
    }
  };
}
