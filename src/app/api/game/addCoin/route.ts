import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { initializeAdminApp } from "@/lib/firebase-admin";
import type { PlayerDocument } from "@/types/database";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { Redis } from "ioredis";
import { NextResponse } from "next/server";
import { logger } from "utils/logger";

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
      await initializeAdminApp();
      const db = getFirestore();
      const userPublicKey = request.user.sub;
      const { amount, batchId } = await request.json();
      const redisModule = await import("@/lib/redis");
      const redis = redisModule.default;

      const idempRes = await checkCoinIdempotency(db, redis, userPublicKey, batchId);
      if (idempRes) return idempRes;

      const rlRes = await handleCoinRateLimit(redis, userPublicKey);
      if (rlRes) return rlRes;

      if (typeof amount !== "number" || amount <= 0)
        return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
      const isGranular =
        Math.abs((amount * 1000) % 1) < 0.0001 || Math.abs((amount * 1000) % 1) > 0.9999;
      if (!isGranular || amount > 0.02)
        return NextResponse.json({ error: "Invalid batch." }, { status: 400 });

      const newBalance = await executeAddCoin(db, userPublicKey, amount, batchId);

      if (redis && batchId)
        await redis.set(`idemp:coin:${userPublicKey}:${batchId}`, "1", "EX", 600);

      const response = NextResponse.json({ success: true, newBalance });
      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, userPublicKey, requestHost);
    } catch (error) {
      return formatGameError(error, "addCoin");
    }
  })
);

async function checkCoinIdempotency(
  db: FirebaseFirestore.Firestore,
  redis: Redis | null,
  userPublicKey: string,
  batchId?: string
) {
  if (!redis || !batchId) return null;
  if (await redis.get(`idemp:coin:${userPublicKey}:${batchId}`)) {
    const doc = await db.collection("players").doc(userPublicKey).get();
    return NextResponse.json({
      success: true,
      newBalance: (doc.data() as PlayerDocument)?.gameUSDTBalance || 0,
      idempotent: true,
    });
  }
  return null;
}

async function handleCoinRateLimit(redis: Redis | null, userPublicKey: string) {
  if (!redis) return null;
  const rlKey = `rate_limit:add_coin:${userPublicKey}`;
  if (await redis.get(rlKey))
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  await redis.set(rlKey, "1", "EX", 1);
  return null;
}

function executeAddCoin(
  db: FirebaseFirestore.Firestore,
  userPublicKey: string,
  amount: number,
  batchId?: string
) {
  const playerDocRef = db.collection("players").doc(userPublicKey);

  return db.runTransaction(async transaction => {
    const docSnap = await transaction.get(playerDocRef);
    if (!docSnap.exists) throw new Error("Player not found.");

    const data = docSnap.data() as PlayerDocument;

    // Transaction-level idempotency: if this batch was already processed, return current balance
    if (batchId && data.lastProcessedBatchId === batchId) {
      return data.gameUSDTBalance || 0;
    }

    const currentBalance = data.gameUSDTBalance || 0;
    const newBalance = Number((currentBalance + amount).toFixed(6));

    logger.log(
      `[Database] addCoin - User: ${userPublicKey}, Old: ${currentBalance}, Add: ${amount}, New: ${newBalance}, Batch: ${batchId || "N/A"}`
    );

    transaction.update(playerDocRef, {
      gameUSDTBalance: newBalance,
      lastInteraction: FieldValue.serverTimestamp(),
      lastProcessedBatchId: batchId || "",
    });

    return newBalance;
  });
}

function formatGameError(error: unknown, context: string) {
  logger.error(`[${context}] Error:`, error as Error);
  const msg = error instanceof Error ? error.message : `Failed to ${context}`;
  return NextResponse.json({ error: msg }, { status: msg.includes("Auth") ? 401 : 500 });
}
