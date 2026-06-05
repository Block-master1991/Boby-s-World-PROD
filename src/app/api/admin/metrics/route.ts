import { withAdminAuth } from "@/lib/admin-middleware";
import { logQueryService } from "@/lib/logging/service/LogQueryService";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAdminAuth(async () => {
  try {
    const stats = await logQueryService.getStats();
    return NextResponse.json(stats);
  } catch (error) {
    logger.error(
      "Failed to fetch metrics:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
});
