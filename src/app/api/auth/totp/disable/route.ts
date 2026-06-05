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

    return NextResponse.json(result);
  } catch (error) {
    logger.error("[TOTP Disable] Error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Failed to disable TOTP" }, { status: 500 });
  }
});
