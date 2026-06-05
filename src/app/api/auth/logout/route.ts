import { auditLogger } from "@/lib/audit-logger";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { CSRFManager } from "@/lib/csrf-utils";
import { JWTManager } from "@/lib/jwt-utils";
import { getClientIp } from "@/lib/request-utils";
import { securityIntegration } from "@/lib/securityIntegration";
import { logger } from "@/utils/logger";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function blacklistTokens(
  request: Request,
  accessToken: string | undefined,
  refreshToken: string | undefined
): Promise<string | undefined> {
  let userPublicKey: string | undefined;
  if (accessToken) {
    logger.log("[LOGOUT] Blacklisting accessToken");
    await JWTManager.revokeToken(accessToken, "logout");
    try {
      const userAgent = request.headers.get("user-agent") || "unknown";
      const payload = await JWTManager.verifyAccessToken(
        accessToken,
        userAgent,
        getClientIp(request)
      );
      if (payload?.sub) userPublicKey = payload.sub;
    } catch (tokenError) {
      logger.warn(
        "[LOGOUT] Could not extract publicKey from accessToken:",
        tokenError instanceof Error ? tokenError.message : String(tokenError)
      );
    }
  }
  if (refreshToken) {
    logger.log("[LOGOUT] Blacklisting refreshToken");
    await JWTManager.revokeToken(refreshToken, "logout");
  }
  return userPublicKey;
}

async function terminateUserSessions(request: Request, userPublicKey: string): Promise<void> {
  logger.log(`[LOGOUT] Invalidating CSRF token for session ${userPublicKey}`);
  await CSRFManager.deleteToken(userPublicKey);

  logger.log(`[LOGOUT] Revoking all advanced sessions for user ${userPublicKey}`);
  await securityIntegration.terminateAllUserSessions(userPublicKey);

  await auditLogger.logEvent(
    "LOGOUT",
    `User logged out: ${userPublicKey}`,
    { userId: userPublicKey, ip: getClientIp(request), endpoint: "/api/auth/logout" },
    "info"
  );
}

function clearAuthCookies(response: NextResponse, requestHost: string | undefined): void {
  const commonExpiredOptions = {
    ...JWTManager.createSecureCookieOptions(-1, requestHost),
    expires: new Date(0),
  };
  const csrfExpiredOptions = { expires: new Date(0), path: "/" };

  const cookiesToClear = [
    "accessToken",
    "refreshToken",
    "session",
    "nonce",
    "secure_session",
    "session_seed",
  ];
  cookiesToClear.forEach(name => response.cookies.set(name, "", commonExpiredOptions));
  response.cookies.set("csrfToken", "", csrfExpiredOptions);
}

export const POST = withCsrfProtection(async (request: Request) => {
  logger.log("[LOGOUT] Received logout request");
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("accessToken")?.value;
    const refreshToken = cookieStore.get("refreshToken")?.value;

    const userPublicKey = await blacklistTokens(request, accessToken, refreshToken);
    if (userPublicKey) await terminateUserSessions(request, userPublicKey);

    const response = NextResponse.json({
      success: true,
      message: "Logged out successfully. All session cookies cleared.",
    });
    clearAuthCookies(response, request.headers.get("host") || undefined);

    logger.log("[LOGOUT] Logout process completed");
    return response;
  } catch (error) {
    logger.error(
      "[POST /api/auth/logout] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        error: "Logout failed",
        details:
          process.env["NODE_ENV"] === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error"
            : "Internal server error",
      },
      { status: 500 }
    );
  }
});
