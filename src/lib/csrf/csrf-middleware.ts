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

export function withCsrfProtection<R extends NextRequest, T extends unknown[]>(
  handler: (req: R, ...args: T) => Promise<NextResponse>
) {
  return async (request: R, ...args: T): Promise<NextResponse> => {
    logger.log("[CSRFMiddleware] Starting CSRF protection check.");

    if (request.nextUrl?.pathname === "/api/auth/logout") {
      return handler(request, ...args);
    }

    try {
      const accessToken = request.cookies.get("accessToken")?.value;
      if (!accessToken) {
        return handler(request, ...args);
      }

      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip = getClientIp(request);
      const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);

      if (!payload || !payload.sub) {
        logger.warn(
          "[CSRFMiddleware] Invalid or expired access token for CSRF check. Denying request."
        );
        return NextResponse.json(
          { error: "Invalid or expired access token for CSRF validation." },
          { status: 401 }
        );
      }

      const sessionId = payload.sub;
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
