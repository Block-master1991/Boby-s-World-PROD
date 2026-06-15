import type { NextRequest, NextResponse } from "next/server";
import { logger } from "utils/logger";
import { isDev } from "../config/env";
import { auditLogger } from "../logging/audit-logger";
import { securityIntegration } from "../security/securityIntegration";
import {
  createAuthErrorResponse,
  extractAuthRequestMetadata,
  type AuthMetadata,
} from "./auth-helpers";
import { JWTManager, type JWTPayload } from "./jwt-utils";

export {
  extractUserFromToken,
  validateTokenFromRequest, verifySessionOrReject
} from "./auth-validation";
export { createAuthErrorResponse, extractAuthRequestMetadata, type AuthMetadata };

export interface AuthenticatedRequest extends NextRequest {
  user: JWTPayload;
}

interface RequestWithTokens extends NextRequest {
  _nextTokens?: { accessToken: string; newRefreshToken: string };
}

/**
 * High-frequency game endpoints where clearing all cookies on auth failures would
 * be destructive (e.g. mid-game coin sync). For these paths:
 *  - Nonce mismatches return 401 WITHOUT cookie clearing (let client retry).
 *  - Token expiry is handled by the standard refresh flow.
 */
const HIGH_FREQ_GAME_PATHS = ["/api/game/addCoin", "/api/game/applyPenalty"] as const;

function isHighFreqGamePath(pathname: string): boolean {
  return HIGH_FREQ_GAME_PATHS.some(p => pathname.startsWith(p));
}

/**
 * The client sends `X-Active-Game: 1` on any request that should be treated
 * as a continuous gameplay signal. When the flag is set we:
 *  - never clear auth cookies on transient failures (lets the user retry),
 *  - extend the issued tokens' lifetime via `isActiveUser`.
 *
 * Header-based, not query-string, so it cannot leak into URLs / logs and
 * the value cannot be forged by a malicious page making GET requests.
 */
function isActiveGameRequest(request: NextRequest): boolean {
  return request.headers.get("x-active-game") === "1";
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
  const { AdvancedRateLimiter } = await import("../ratelimit/advancedRateLimiter");
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

const ACTIVE_USER_MESSAGE = "Game session in progress. Please continue playing.";

/**
 * Resolves whether the request should be treated as live gameplay. The header
 * is only honored for `/api/game/*` paths to prevent arbitrary routes from
 * triggering token extension.
 */
function resolveActiveUser(request: NextRequest): boolean {
  const isHighFreq = isHighFreqGamePath(request.nextUrl.pathname);
  const isActiveGame = isActiveGameRequest(request);
  return isHighFreq || (isActiveGame && request.nextUrl.pathname.startsWith("/api/game/"));
}

function pickAuthError(code: string, defaultMessage: string, isActiveUser: boolean) {
  return createAuthErrorResponse({
    message: isActiveUser ? ACTIVE_USER_MESSAGE : defaultMessage,
    code,
    status: 401,
    clearCookies: !isActiveUser,
  });
}

async function handleTokenAuth(
  request: NextRequest,
  metadata: AuthMetadata
): Promise<NextResponse | { payload: JWTPayload }> {
  const { accessToken, refreshToken, userAgent, ip } = metadata;
  const isActiveUser = resolveActiveUser(request);

  const payload = accessToken
    ? await JWTManager.verifyAccessToken(accessToken, userAgent, ip)
    : null;

  if (payload) {
    const storedNonce = request.cookies.get("nonce")?.value;
    if (!storedNonce || payload.nonce !== storedNonce) {
      if (!isDev) {
        logger.warn(`[AuthMiddleware] Nonce mismatch for ${payload.sub}. Revoking session.`);
        return pickAuthError("NONCE_MISMATCH", "Session nonce invalid. Please login again.", isActiveUser);
      }
      logger.warn(
        `[AuthMiddleware] ⚠️ Nonce mismatch bypassed in dev. Payload: ${payload.nonce}, Cookie: ${storedNonce}`
      );
    }
    return { payload };
  }

  if (!refreshToken) {
    return pickAuthError("NO_TOKENS", "Authentication required.", isActiveUser);
  }

  const refreshResult = await JWTManager.refreshAccessToken(
    refreshToken,
    userAgent,
    ip,
    isActiveUser
  );
  if (refreshResult) {
    const newPayload = await JWTManager.verifyAccessToken(refreshResult.accessToken, userAgent, ip);
    if (newPayload) {
      (request as RequestWithTokens)._nextTokens = refreshResult;
      return { payload: newPayload };
    }
    return pickAuthError("REFRESH_VERIFY_FAILED", "Session refresh failed verification.", isActiveUser);
  }

  return pickAuthError("INVALID_OR_EXPIRED_TOKEN", "Invalid session. Please login again.", isActiveUser);
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
    if (sessionValidation.isInfraError) {
      // Redis is down or unreachable — do NOT log the user out.
      // Fall back to JWT-only authentication so users can keep playing.
      logger.warn(
        `[AuthMiddleware withAuth] Redis/session infra error for ${payload.sub}. ` +
        `Falling back to JWT-only auth. Error: ${sessionValidation.error}`
      );
      return { nextSeed: undefined };
    }

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
  const isActiveUser = resolveActiveUser(request);
  const cookies = JWTManager.createSecureCookieOptions(0, requestHost, isActiveUser);
  const tokens = (request as RequestWithTokens)._nextTokens;

  if (tokens) {
    response.cookies.set(
      "accessToken",
      tokens.accessToken,
      JWTManager.createSecureCookieOptions(15 * 60, requestHost, isActiveUser)
    );
    response.cookies.set(
      "refreshToken",
      tokens.newRefreshToken,
      JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost, isActiveUser)
    );

    const { CSRFManager } = await import("@/lib/csrf/csrf-utils");
    const csrfToken = await CSRFManager.getOrCreateToken(payload.sub);
    response.cookies.set("csrfToken", csrfToken, {
      httpOnly: false,
      secure: cookies.secure,
      sameSite: cookies.sameSite,
      maxAge: 30 * 60,
      path: "/",
    });
  }

  if (nextSeed) {
    response.cookies.set(
      "session_seed",
      nextSeed,
      JWTManager.createSecureCookieOptions(30 * 60, requestHost, isActiveUser)
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
