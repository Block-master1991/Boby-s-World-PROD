import { withAuth } from "@/lib/auth-middleware";
import { TOTPService } from "@/lib/totp-service";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAuth(async request => {
  try {
    const userId = request.user.sub;
    const setupData = await TOTPService.initiateSetup(userId, userId);

    return NextResponse.json(setupData);
  } catch (error) {
    logger.error("[TOTP Setup] Error:", error);
    return NextResponse.json({ error: "Failed to initiate TOTP setup" }, { status: 500 });
  }
});
