import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { createAuthErrorResponse, withAuth } from "@/lib/auth-middleware";
import { TOTPService } from "@/lib/totp-service";
import { isDev } from "@/lib/config/env";
import { setCsrfTokenResponse } from "@/lib/csrf-helper";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  logger.log("[SESSION CHECK] Secured session check request");
  try {
    const jwtPayload = request.user;
    if (!jwtPayload) {
      return createAuthErrorResponse({
        message: "Not authenticated.",
        code: "NOT_AUTHENTICATED",
        status: 401,
      });
    }

    // 1. Strict Nonce Verification (Consistency Check)
    const storedNonce = request.cookies.get("nonce")?.value;
    const host = request.headers.get("host") || "";
    const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || isDev;

    if (!storedNonce || jwtPayload.nonce !== storedNonce) {
      if (isDev || isLocalhost) {
        logger.warn(
          `[SESSION CHECK] ⚠️ Nonce mismatch bypassed in development. Payload: ${jwtPayload.nonce}, Cookie: ${storedNonce}`
        );
      } else {
        logger.warn(
          `[SESSION CHECK] Nonce mismatch or missing! Payload: ${jwtPayload.nonce}, Cookie: ${storedNonce}`
        );
        return createAuthErrorResponse({
          message: "Session nonce invalid or missing. Please login again.",
          code: "NONCE_MISMATCH",
          status: 401,
          clearCookies: true,
        });
      }
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        wallet: jwtPayload.sub,
        iat: jwtPayload.iat,
        exp: jwtPayload.exp,
        authMethod: jwtPayload.authMethod,
        totpEnabled: jwtPayload.totpEnabled ?? await TOTPService.isTOTPEnabled(jwtPayload.sub),
      },
    });

    // 2. CSRF Synchronization & Response Standardization
    const requestHost = request.headers.get("host") || undefined;
    return await setCsrfTokenResponse(response, jwtPayload.sub, requestHost);
  } catch (error) {
    logger.error("[SESSION CHECK] Unexpected error:", error as Error);
    return createAuthErrorResponse({
      message: "Session check failed.",
      code: "INTERNAL_ERROR",
      status: 500,
    });
  }
});
