/**
 * Account Recovery API Routes
 * Handles secure account recovery process for users who lose access to all passkeys
 */

import { RecoveryService } from "@/lib/auth/recovery-service";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { getClientIp } from "@/lib/request-utils";
import { RecoveryInitiateSchema, validateRequestBody } from "@/lib/validation-schemas";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/recovery/initiate
 * Initiates account recovery process
 */
export const POST = withCsrfProtection(async (request: Request) => {
  try {
    const { email, publicKey } = await validateRequestBody(request, RecoveryInitiateSchema);

    const metadata = {
      ipAddress: getClientIp(request),
      userAgent: request.headers.get("user-agent") || "unknown",
      endpoint: "/api/auth/recovery/initiate",
    };

    // 1. Eligibility Check
    const eligibility = await RecoveryService.checkEligibility(publicKey);
    if (!eligibility.allowed) {
      return NextResponse.json(
        { error: eligibility.reason },
        { status: eligibility.status || 400 }
      );
    }

    // 2. User & Email Verification
    const { exists, hasPasskeys, emailMatch } = await RecoveryService.verifyUserRecord(
      publicKey,
      email
    );
    if (!exists) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!emailMatch)
      return NextResponse.json(
        { error: "Email does not match the registered email for this wallet" },
        { status: 403 }
      );
    if (!hasPasskeys)
      return NextResponse.json({ error: "No passkeys found for this account" }, { status: 404 });

    // 3. Initiate Recovery
    const recoveryToken = await RecoveryService.initiateRecovery(publicKey, email, metadata);
    if (!recoveryToken)
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });

    return NextResponse.json({
      success: true,
      message: "Recovery initiated. Check your email for instructions.",
      token: recoveryToken,
      publicKey: publicKey,
    });
  } catch (error) {
    logger.error(
      "[Recovery Initiate] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
