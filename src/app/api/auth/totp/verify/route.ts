import { sessionManager } from "@/lib/advancedSessionManager";
import { auditLogger } from "@/lib/audit-logger";
import { setCsrfTokenResponse } from "@/lib/csrf-helper";
import { JWTManager } from "@/lib/jwt-utils";
import { getClientIp, isMobile } from "@/lib/request-utils";
import { securityIntegration } from "@/lib/securityIntegration";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { userId, token } = await request.json();
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";
    const mobile = isMobile(request);

    if (!userId || !token) {
      return NextResponse.json({ error: "User ID and token are required" }, { status: 400 });
    }

    const secret = await TOTPService.getUserSecret(userId);
    if (!secret) {
      return NextResponse.json({ error: "TOTP not enabled for this user" }, { status: 403 });
    }

    let isValid = await TOTPService.verifyToken(token, secret);

    if (!isValid && token.length === 8) {
      isValid = await TOTPService.verifyBackupCode(userId, token);
    }

    if (!isValid) {
      await auditLogger.logEvent(
        "TOTP_VERIFICATION_FAILED",
        `Invalid TOTP token for user ${userId}`,
        { ip, userAgent },
        "warn"
      );
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }

    const rhost = request.headers.get("host") || "";
    const resp = NextResponse.json({
      success: true,
      message: "Login successful",
      publicKey: userId,
    });

    const nonce = `totp-${Date.now()}`;
    const ipHash = createHash("sha256").update(ip).digest("base64");
    const userAgentHash = createHash("sha256").update(userAgent).digest("base64");

    const accessToken = JWTManager.createAccessToken({
      publicKey: userId,
      nonce,
      userAgentHash,
      ipHash,
      authMethod: "totp",
      totpEnabled: true,
    });
    const refreshToken = JWTManager.createRefreshToken({
      publicKey: userId,
      nonce,
      userAgentHash,
      ipHash,
      authMethod: "totp",
      totpEnabled: true,
    });

    const cookieOptions = JWTManager.createSecureCookieOptions(15 * 60, rhost);
    resp.cookies.set("accessToken", accessToken, cookieOptions);
    resp.cookies.set(
      "refreshToken",
      refreshToken,
      JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, rhost)
    );
    resp.cookies.set("nonce", nonce, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, rhost));

    const sess = await sessionManager.createSecureSession(
      userId,
      securityIntegration.extractDeviceInfo(request),
      {
        authMethod: "totp",
      }
    );

    if (sess) {
      const sessCookieOptions = JWTManager.createSecureCookieOptions(30 * 60, rhost);
      resp.cookies.set("secure_session", sess.sessionId, { ...sessCookieOptions, httpOnly: true });
      resp.cookies.set("session_seed", sess.currentSeed, { ...sessCookieOptions, httpOnly: true });
    }
    await auditLogger.logEvent(
      "LOGIN_SUCCESS",
      `User ${userId} logged in via TOTP`,
      { ip, userAgent, mobile },
      "info"
    );
    return await setCsrfTokenResponse(resp, userId, rhost);
  } catch (error) {
    logger.error("[TOTP Verify] Error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}
