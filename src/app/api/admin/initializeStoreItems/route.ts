import { withAdminAuth } from "@/lib/admin-middleware";
import { initializeStoreItemsInFirestore } from "@/lib/server-items/server-items";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAdminAuth(async () => {
  try {
    await initializeStoreItemsInFirestore();
    return NextResponse.json({
      message: "Store items initialization process started. Check server logs for details.",
    });
  } catch (error) {
    logger.error("Error initializing store items via API:", error as Error);
    return NextResponse.json({ error: "Failed to initialize store items." }, { status: 500 });
  }
});
