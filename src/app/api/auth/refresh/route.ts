import { createAuthErrorResponse } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { JWTManager } from "@/lib/jwt-utils";
import { getClientIp } from "@/lib/request-utils";
import { logger } from "@/utils/logger";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

async function rotateTokens(
  refreshToken: string,
  nonce: string,
  metadata: { userAgent: string; ip: string; host?: string }
) {
  const { userAgent, ip, host } = metadata;
  const payload = await JWTManager.verifyRefreshToken(refreshToken, userAgent, ip);

  if (!payload || payload.nonce !== nonce) {
    logger.warn(`[REFRESH] Invalid token or nonce mismatch. Sub: ${payload?.sub}`);
    return createAuthErrorResponse({
      message: "Invalid session. Please login again.",
      code: "AUTH_MISMATCH",
      status: 403,
      clearCookies: true,
    });
  }

  const result = await JWTManager.refreshAccessToken(refreshToken, userAgent, ip);
  if (!result) {
    return createAuthErrorResponse({
      message: "Session expired. Please login again.",
      code: "REFRESH_EXPIRED",
      status: 401,
      clearCookies: true,
    });
  }

  const response = NextResponse.json({ success: true, message: "Tokens refreshed" });
  const refreshOps = JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, host);

  response.cookies.set(
    "accessToken",
    result.accessToken,
    JWTManager.createSecureCookieOptions(15 * 60, host)
  );
  response.cookies.set("refreshToken", result.newRefreshToken, refreshOps);
  response.cookies.set("nonce", nonce, refreshOps);

  return setCsrfTokenResponse(response, payload.sub, host);
}

export const POST = withCsrfProtection(async (request: Request) => {
  logger.log("[REFRESH] Token refresh requested");
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("refreshToken")?.value;
    const nonce = cookieStore.get("nonce")?.value;

    if (!token || !nonce) {
      return createAuthErrorResponse({
        message: "Missing tokens",
        code: "MISSING_AUTH_DATA",
        status: 401,
        clearCookies: true,
      });
    }

    const host = request.headers.get("host");
    const metadata: { userAgent: string; ip: string; host?: string } = {
      userAgent: request.headers.get("user-agent") || "unknown",
      ip: getClientIp(request),
    };
    if (host) metadata.host = host;

    return rotateTokens(token, nonce, metadata);
  } catch (error) {
    logger.error("[REFRESH] Internal error:", error);
    const response = createAuthErrorResponse({
      message: "Token refresh failed",
      code: "REFRESH_ERROR",
      status: 500,
    });
    ["accessToken", "refreshToken", "nonce"].forEach(c => response.cookies.delete(c));
    return response;
  }
});
