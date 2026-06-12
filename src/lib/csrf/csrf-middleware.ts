import type { AuthenticatedRequest } from "@/lib/auth/auth-middleware";
import { getClientIp } from "@/lib/request-utils";
import { logger } from "@/utils/logger";
import { NextResponse, type NextRequest } from "next/server";
import { JWTManager } from "../auth/jwt-utils";
import { auditLogger } from "../logging/audit-logger";
import { CSRFManager } from "./csrf-utils";

async function validateCsrfToken(
  request: NextRequest,
  sessionId: string,
  ip: string,
  userAgent: string
): Promise<NextResponse | null> {
  const clientCsrfToken = request.headers.get("x-csrf-token");
  if (!clientCsrfToken) {
    logger.warn(
      `[CSRFMiddleware] No X-CSRF-Token header found for session ${sessionId}. Denying request.`
    );
    return NextResponse.json({ error: "CSRF token header missing." }, { status: 403 });
  }

  const isCsrfTokenValid = await CSRFManager.verifyToken(sessionId, clientCsrfToken);
  if (!isCsrfTokenValid) {
    logger.warn(
      `[CSRFMiddleware] Invalid or expired CSRF token for session ${sessionId}. Denying request.`
    );
    await auditLogger.logCsrfViolation({
      sessionId,
      ipAddress: ip,
      userAgent,
      endpoint: request.nextUrl.pathname,
      deviceFingerprint: "unknown",
    });
    return NextResponse.json({ error: "Invalid or expired CSRF token." }, { status: 403 });
  }
  return null;
}

/**
 * Resolves the session ID for CSRF validation.
 *
 * Strategy (in order of priority):
 * 1. If the request already went through `withAuth`, `request.user.sub` is populated —
 *    use it directly (avoids a second token verification that would fail after token rotation).
 * 2. Otherwise fall back to reading & verifying the access token from cookies
 *    (standalone routes like /api/auth/refresh, /api/auth/logout).
 *
 * Returns `null` when the session ID cannot be determined (unauthenticated request
 * that should be let through without CSRF enforcement).
 */
async function resolveSessionId(
  request: NextRequest,
  userAgent: string,
  ip: string
): Promise<{ sessionId: string | null; errorResponse: NextResponse | null }> {
  // --- Priority 1: already authenticated by withAuth ---
  const authedUser = (request as AuthenticatedRequest).user;
  if (authedUser?.sub) {
    return { sessionId: authedUser.sub, errorResponse: null };
  }

  // --- Priority 2: standalone route — read token from cookies ---
  const accessToken = request.cookies.get("accessToken")?.value;
  if (!accessToken) {
    // No token present; let the handler decide (it may be an unauthenticated endpoint).
    return { sessionId: null, errorResponse: null };
  }

  const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
  if (!payload?.sub) {
    // Token present but invalid — only block if a CSRF header was also sent,
    // meaning the client expected protection.  Otherwise pass through so
    // withAuth (outer wrapper) can handle the authentication error uniformly.
    const hasCsrfHeader = !!request.headers.get("x-csrf-token");
    if (hasCsrfHeader) {
      logger.warn(
        "[CSRFMiddleware] Invalid/expired access token with CSRF header present. Denying."
      );
      return {
        sessionId: null,
        errorResponse: NextResponse.json(
          { error: "Invalid or expired access token for CSRF validation." },
          { status: 401 }
        ),
      };
    }
    return { sessionId: null, errorResponse: null };
  }

  return { sessionId: payload.sub, errorResponse: null };
}

export function withCsrfProtection<R extends NextRequest, T extends unknown[]>(
  handler: (req: R, ...args: T) => Promise<NextResponse>
) {
  return async (request: R, ...args: T): Promise<NextResponse> => {
    logger.log("[CSRFMiddleware] Starting CSRF protection check.");

    if (request.nextUrl?.pathname === "/api/auth/logout") {
      return handler(request, ...args);
    }

    try {
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip = getClientIp(request);

      const { sessionId, errorResponse } = await resolveSessionId(request, userAgent, ip);

      if (errorResponse) return errorResponse;

      if (!sessionId) {
        // No authenticated session found — pass through without CSRF enforcement.
        return handler(request, ...args);
      }

      const csrfError = await validateCsrfToken(request, sessionId, ip, userAgent);
      if (csrfError) return csrfError;

      logger.log(
        `[CSRFMiddleware] CSRF token valid for session ${sessionId}. Proceeding with handler.`
      );
      return handler(request, ...args);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      logger.error("[CSRFMiddleware] Error during CSRF protection:", errorMessage);
      return NextResponse.json(
        { error: "Internal server error during CSRF validation." },
        { status: 500 }
      );
    }
  };
}
