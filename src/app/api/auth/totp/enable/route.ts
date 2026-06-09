import { withAuth } from "@/lib/auth/auth-middleware";
import { TOTPService } from "@/lib/auth/totp-service";
import { getClientIp } from "@/lib/request-utils";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const POST = withAuth(async request => {
  try {
    const userId = request.user.sub;
    const { token, secret } = await request.json();

    if (!token || !secret) {
      return NextResponse.json({ error: "Token and secret are required" }, { status: 400 });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";

    const result = await TOTPService.enableTOTP(userId, token, secret, {
      ip,
      userAgent,
    });

    const response = NextResponse.json(result);

    // Upgrade the current session to MFA since they just verified their token
    const { JWTManager } = await import("@/lib/auth/jwt-utils");
    const requestHost = request.headers.get("host") || undefined;

    const newAccessToken = JWTManager.createAccessToken({
      publicKey: userId,
      nonce: request.user.nonce,
      userAgentHash: request.user.userAgentHash,
      ipHash: request.user.ipHash,
      authMethod: "totp",
      totpEnabled: true,
    });

    const newRefreshToken = JWTManager.createRefreshToken({
      publicKey: userId,
      nonce: request.user.nonce,
      userAgentHash: request.user.userAgentHash,
      ipHash: request.user.ipHash,
      authMethod: "totp",
      totpEnabled: true,
    });

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
    logger.error("[TOTP Enable] Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enable TOTP" },
      { status: 400 }
    );
  }
});
