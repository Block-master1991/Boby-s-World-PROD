/**
 * API Route: Fetch Player Data
 * GET /api/game/fetchPlayerData
 */

import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { initializeAdminApp } from "@/lib/firebase/firebase-admin";
import type { PlayerDocument } from "@/types/database";
import { COLLECTIONS } from "@/types/database";
import { logger } from "@/utils/logger";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { createInitialPlayerData, handleFetchError } from "./fetchHelpers";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    await initializeAdminApp();
    const db = getFirestore();
    const userPublicKey = request.user.sub;
    const playerDocRef = db.collection(COLLECTIONS.PLAYERS).doc(userPublicKey);

    const docSnap = await playerDocRef.get();

    if (!docSnap.exists) {
      const initialData = createInitialPlayerData(userPublicKey);
      await playerDocRef.set(initialData);
      return NextResponse.json({ gameUSDTBalance: 0, inventory: [] }, { status: 200 });
    }

    // Record login/interaction
    await playerDocRef.update({
      lastLogin: FieldValue.serverTimestamp(),
      lastInteraction: FieldValue.serverTimestamp(),
    });

    const data = docSnap.data() as PlayerDocument;

    return NextResponse.json({
      gameUSDTBalance: data["gameUSDTBalance"] || 0,
      inventory: data["inventory"] || [],
    });
  } catch (error) {
    logger.error(
      "[Fetch Player Data] Error:",
      error instanceof Error ? error.message : String(error)
    );
    return handleFetchError(error);
  }
});
