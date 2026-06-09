import { sessionManager } from "@/lib/advancedSessionManager";
import { auditLogger } from "@/lib/audit-logger";
import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { JWTManager } from "@/lib/jwt-utils";
import { getClientIp, isMobile } from "@/lib/request-utils";
import { securityIntegration } from "@/lib/securityIntegration";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

// ─── Helper: verify TOTP token or backup code ────────────────────────────────
async function verifyTotpToken(
  userId: string,
  token: string
): Promise<{ isValid: boolean; reason: string }> {
  const secret = await TOTPService.getUserSecret(userId);
  if (!secret) return { isValid: false, reason: "no_secret" };

  const verificationResult = await TOTPService.verifyTokenWithReason(token, secret);
  let isValid = verificationResult === "valid";

  if (!isValid && token.length === 8) {
    isValid = await TOTPService.verifyBackupCode(userId, token);
  }

  return { isValid, reason: verificationResult };
}

// ─── Helper: build access + refresh tokens ───────────────────────────────────
function buildTotpTokens(userId: string, ip: string, userAgent: string) {
  const nonce = `totp-${Date.now()}`;
  const ipHash = createHash("sha256").update(ip).digest("base64");
  const userAgentHash = createHash("sha256").update(userAgent).digest("base64");

  const tokenParams = {
    publicKey: userId,
    nonce,
    userAgentHash,
    ipHash,
    authMethod: "totp" as const,
    totpEnabled: true,
  };

  return {
    nonce,
    accessToken: JWTManager.createAccessToken(tokenParams),
    refreshToken: JWTManager.createRefreshToken(tokenParams),
  };
}

// ─── Helper: attach cookies and session to response ──────────────────────────
interface TotpSessionParams {
  userId: string;
  rhost: string;
  nonce: string;
  accessToken: string;
  refreshToken: string;
}

async function attachTotpCookies(
  request: AuthenticatedRequest,
  resp: NextResponse,
  params: TotpSessionParams
): Promise<void> {
  const { userId, rhost, nonce, accessToken, refreshToken } = params;
  resp.cookies.set("accessToken", accessToken, JWTManager.createSecureCookieOptions(15 * 60, rhost));
  resp.cookies.set("refreshToken", refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, rhost));
  resp.cookies.set("nonce", nonce, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, rhost));

  const sess = await sessionManager.createSecureSession(
    userId,
    securityIntegration.extractDeviceInfo(request),
    { authMethod: "totp" }
  );

  if (sess) {
    const sessCookieOptions = JWTManager.createSecureCookieOptions(30 * 60, rhost);
    resp.cookies.set("secure_session", sess.sessionId, { ...sessCookieOptions, httpOnly: true });
    resp.cookies.set("session_seed", sess.currentSeed, { ...sessCookieOptions, httpOnly: true });
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export const POST = withAuth(async (request) => {
  try {
    const { token } = await request.json();
    const userId = request.user.sub;
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "unknown";
    const mobile = isMobile(request);

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const { isValid, reason } = await verifyTotpToken(userId, token);

    if (reason === "no_secret") {
      return NextResponse.json({ error: "TOTP not enabled for this user" }, { status: 403 });
    }

    if (!isValid) {
      const errorMessage =
        reason === "expired"
          ? "Expired verification code. Please use the latest code from your authenticator app."
          : "Invalid verification code. Please check the code and try again.";
      await auditLogger.logEvent(
        "TOTP_VERIFICATION_FAILED",
        `${errorMessage} for user ${userId}`,
        { ip, userAgent },
        "warn"
      );
      return NextResponse.json({ error: errorMessage }, { status: 401 });
    }

    const rhost = request.headers.get("host") || "";
    const resp = NextResponse.json({
      success: true,
      message: "Login successful",
      publicKey: userId,
      authMethod: "totp",
      totpEnabled: true,
    });

    const { nonce, accessToken, refreshToken } = buildTotpTokens(userId, ip, userAgent);
    await attachTotpCookies(request, resp, { userId, rhost, nonce, accessToken, refreshToken });

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
});
