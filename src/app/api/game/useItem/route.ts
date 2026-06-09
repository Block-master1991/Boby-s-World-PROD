/**
 * API Route: Use Consumable Item
 * POST /api/game/useItem
 */

import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { db } from "@/lib/firebase/firebase-admin";
import type { PlayerDocument } from "@/types/database";
import { COLLECTIONS } from "@/types/database";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { logger } from "utils/logger";
import {
  calculateUpdatedInventory,
  handleUseItemError,
  validateUseRequest,
} from "./useItemHelpers";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    logger.log("[API] /api/game/useItem called");

    const userPublicKey = request.user?.sub;
    if (!userPublicKey) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
      const body = await request.json();
      const { itemId, amount } = validateUseRequest(body.itemId, body.amount);

      const playerDocRef = db.collection(COLLECTIONS.PLAYERS).doc(userPublicKey);
      const docSnap = await playerDocRef.get();

      if (!docSnap.exists) {
        return NextResponse.json({ error: "Player not found." }, { status: 404 });
      }

      const playerData = docSnap.data() as PlayerDocument;
      const inventory = playerData["inventory"] || [];

      const updatedInventory = calculateUpdatedInventory(inventory, itemId, amount);

      await playerDocRef.update({
        inventory: updatedInventory,
        lastInteraction: FieldValue.serverTimestamp(),
      });

      const response = NextResponse.json({ success: true, itemsUsed: amount });
      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, userPublicKey, requestHost);
    } catch (error) {
      logger.error(
        "[useItem] Process Error:",
        error instanceof Error ? error.message : String(error)
      );
      return handleUseItemError(error);
    }
  })
);
