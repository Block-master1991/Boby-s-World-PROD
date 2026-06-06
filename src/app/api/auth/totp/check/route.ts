import { withAuth } from "@/lib/auth-middleware";
import redis from "@/lib/redis";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const PURCHASE_VERIFICATION_PREFIX = "purchase_auth_token:";
const PURCHASE_VERIFICATION_TTL_SECONDS = 180;

const createPurchaseVerificationToken = async (userId: string) => {
  const token = randomBytes(24).toString("hex");
  await redis.setex(
    `${PURCHASE_VERIFICATION_PREFIX}${token}`,
    PURCHASE_VERIFICATION_TTL_SECONDS,
    userId
  );
  return token;
};

export const POST = withAuth(async (request) => {
  try {
    const { token } = await request.json();
    const userId = request.user.sub;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const secret = await TOTPService.getUserSecret(userId);
    if (!secret) {
      return NextResponse.json({ error: "TOTP not enabled for this user" }, { status: 403 });
    }

    const verificationResult = await TOTPService.verifyTokenWithReason(token, secret);
    const isBackup =
      verificationResult !== "valid" &&
      token.length === 8 &&
      (await TOTPService.verifyBackupCode(userId, token));
    const isValid = verificationResult === "valid" || isBackup;

    if (!isValid) {
      const errorMessage =
        verificationResult === "expired"
          ? "Expired verification code. Please use the latest code from your authenticator app."
          : "Invalid verification code";
      return NextResponse.json({ error: errorMessage }, { status: 401 });
    }

    const purchaseVerificationToken = await createPurchaseVerificationToken(userId);
    return NextResponse.json({ success: true, purchaseVerificationToken });
  } catch (error) {
    logger.error("[TOTP Check] Error:", error as Error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
});