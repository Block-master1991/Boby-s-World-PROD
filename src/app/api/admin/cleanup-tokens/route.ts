import { env } from "@/lib/config/env";
import { initializeAdminApp } from "@/lib/firebase-admin";
import { logger } from "@/utils/logger";
import { getFirestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // 1. Authenticate the request
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Proceed with the cleanup logic
  try {
    await initializeAdminApp();
    const db = getFirestore();
    const now = Date.now();
    const csrfTokensRef = db.collection("csrfTokens");

    // Query for all documents where the 'expiry' field is in the past
    const expiredTokensQuery = csrfTokensRef.where("expiry", "<", now);
    const snapshot = await expiredTokensQuery.get();

    if (snapshot.empty) {
      return NextResponse.json({ success: true, message: "No expired tokens to clean up." });
    }

    // Create a batched write to delete all expired tokens at once
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    const message = `Successfully deleted ${snapshot.size} expired CSRF tokens.`;
    return NextResponse.json({ success: true, message });
  } catch (error) {
    logger.error("[Cron Cleanup] Error cleaning up expired tokens:", error as Error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}
