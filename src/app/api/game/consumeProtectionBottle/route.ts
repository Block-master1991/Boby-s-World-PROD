/**
 * API Route: Consume Protection Bottle
 * POST /api/game/consumeProtectionBottle
 */

import type { AuthenticatedRequest } from "@/lib/auth/auth-middleware";
import { withAuth } from "@/lib/auth/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { db } from "@/lib/firebase/firebase-admin";
import type { InventoryItem, PlayerDocument } from "@/types/database";
import { COLLECTIONS } from "@/types/database";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { logger } from "utils/logger";
import { decrementInventoryItem, handleConsumeError } from "./consumeHelpers";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    const userPublicKey = request.user?.sub;
    if (!userPublicKey) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const playerDocRef = db.collection(COLLECTIONS.PLAYERS).doc(userPublicKey);
      const docSnap = await playerDocRef.get();

      if (!docSnap.exists) {
        throw new Error("Player data not found.");
      }

      const playerData = docSnap.data() as PlayerDocument;
      const currentInventory = (playerData["inventory"] || []) as InventoryItem[];

      // '1' is the ID for Protection Bottle
      const updatedInventory = decrementInventoryItem(currentInventory, "1");

      await playerDocRef.update({
        inventory: updatedInventory,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const response = NextResponse.json({
        success: true,
        message: "Protection Bottle consumed successfully.",
        newInventory: updatedInventory,
      });

      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, userPublicKey, requestHost);
    } catch (error) {
      logger.error(
        "[Consume Bottle] Process Error:",
        error instanceof Error ? error.message : String(error)
      );
      return handleConsumeError(error);
    }
  })
);
