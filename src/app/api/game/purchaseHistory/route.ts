/**
 * API Route: Fetch Purchase History
 * GET /api/game/purchaseHistory
 */

import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { db } from "@/lib/firebase-admin";
import type { TransactionSignatureDocument } from "@/types/database";
import { COLLECTIONS } from "@/types/database";
import { NextResponse } from "next/server";
import { logger } from "utils/logger";
import { mapToPurchaseRecord } from "./purchaseHistoryHelpers";
export type { PurchaseRecord } from "./purchaseHistoryHelpers";

export const GET = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    logger.log("[API] /api/game/purchaseHistory called");

    const userPublicKey = request.user?.sub;
    if (!userPublicKey) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const signaturesSnapshot = await db
        .collection(COLLECTIONS.USED_TRANS_SIGS)
        .where("userId", "==", userPublicKey)
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();

      const purchases = signaturesSnapshot.docs.map(doc =>
        mapToPurchaseRecord(doc.id, doc.data() as TransactionSignatureDocument)
      );

      return NextResponse.json({
        success: true,
        purchases,
        total: purchases.length,
      });
    } catch (error) {
      logger.error(
        "[Purchase History] Error:",
        error instanceof Error ? error.message : String(error)
      );
      return NextResponse.json({ error: "Failed to fetch purchase history." }, { status: 500 });
    }
  })
);
