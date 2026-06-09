import { withAuth } from "@/lib/auth/auth-middleware";
import { TOTPService } from "@/lib/auth/totp-service";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const POST = withAuth(async request => {
  try {
    const userId = request.user.sub;
    const codes = await TOTPService.generateBackupCodes(userId);
    return NextResponse.json({ codes });
  } catch (error) {
    logger.error("[Backup Codes] Error:", error);
    return NextResponse.json({ error: "Failed to generate backup codes" }, { status: 500 });
  }
});
