import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { initializeAdminApp } from "@/lib/firebase-admin";
import type { PlayerDocument } from "@/types/database";
import { logger } from "@/utils/logger";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    logger.log("[API] /api/game/withdrawUSDT called");

    try {
      await initializeAdminApp(); // Initialize inside the handler
      const db = getFirestore();

      const userPublicKey = request.user.sub;

      const { amount } = await request.json();

      if (typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ error: "Invalid withdrawal amount provided." }, { status: 400 });
      }

      const playerDocRef = db.collection("players").doc(userPublicKey);

      // Transaction to ensure atomic read-modify-write
      const newBalance = await db.runTransaction(async transaction => {
        const docSnap = await transaction.get(playerDocRef);

        if (!docSnap.exists) {
          throw new Error("Player data not found.");
        }

        const data = docSnap.data() as PlayerDocument;
        const currentBalance = (data["gameUSDTBalance"] as number) || 0;

        if (currentBalance < amount) {
          throw new Error("Insufficient balance for withdrawal.");
        }

        const updatedBalance = currentBalance - amount;
        logger.log(
          `[Database] withdrawUSDT - User: ${userPublicKey}, Old: ${currentBalance}, Withdraw: ${amount}, New: ${updatedBalance}`
        );
        transaction.update(playerDocRef, {
          gameUSDTBalance: updatedBalance,
          lastInteraction: FieldValue.serverTimestamp(),
        });
        return updatedBalance;
      });

      const response = NextResponse.json({ success: true, newBalance });

      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, userPublicKey, requestHost);
    } catch (error) {
      return formatGameError(error, "withdrawUSDT");
    }
  })
);

function formatGameError(error: unknown, context: string) {
  logger.error(`[${context}] Error:`, error as Error);
  let errorMessage = error instanceof Error ? error.message : `Failed to ${context}`;
  let statusCode = 500;

  if (errorMessage.includes("Firebase Admin SDK")) {
    errorMessage = "Server configuration error: Firebase Admin SDK not properly set up.";
  } else if (errorMessage.includes("Authentication required")) {
    statusCode = 401;
  } else if (errorMessage.includes("Insufficient balance")) {
    statusCode = 400;
  } else if (errorMessage.includes("Player data not found")) {
    statusCode = 404;
  }

  return NextResponse.json({ error: errorMessage }, { status: statusCode });
}
