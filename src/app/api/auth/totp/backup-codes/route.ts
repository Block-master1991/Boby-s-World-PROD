import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";

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
