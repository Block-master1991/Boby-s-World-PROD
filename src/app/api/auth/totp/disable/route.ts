import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";
import { getClientIp } from "@/lib/request-utils";

export const POST = withAuth(async request => {
  try {
    const userId = request.user.sub;
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await TOTPService.disableTOTP(userId, {
      ip,
      userAgent,
    });

    const { JWTManager } = await import("@/lib/jwt-utils");
    const requestHost = request.headers.get("host") || undefined;

    const newAccessToken = JWTManager.createAccessToken({
      publicKey: userId,
      nonce: request.user.nonce,
      userAgentHash: request.user.userAgentHash,
      ipHash: request.user.ipHash,
      authMethod: request.user.authMethod === "totp" ? undefined : request.user.authMethod,
      totpEnabled: false,
    });

    const newRefreshToken = JWTManager.createRefreshToken({
      publicKey: userId,
      nonce: request.user.nonce,
      userAgentHash: request.user.userAgentHash,
      ipHash: request.user.ipHash,
      authMethod: request.user.authMethod === "totp" ? undefined : request.user.authMethod,
      totpEnabled: false,
    });

    const response = NextResponse.json(result);

    response.cookies.set(
      "accessToken",
      newAccessToken,
      JWTManager.createSecureCookieOptions(15 * 60, requestHost)
    );
    response.cookies.set(
      "refreshToken",
      newRefreshToken,
      JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost)
    );

    return response;
  } catch (error) {
    logger.error("[TOTP Disable] Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Failed to disable TOTP" }, { status: 500 });
  }
});
