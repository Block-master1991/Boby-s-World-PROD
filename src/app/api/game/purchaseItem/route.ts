import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from "@/lib/constants";
import { setCsrfTokenResponse } from "@/lib/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf-middleware";
import { initializeAdminApp } from "@/lib/firebase-admin";
import { DEDICATED_RPC_ENDPOINT } from "@/lib/server-constants";
import { getActiveStoreItems } from "@/lib/server-items";
import { PurchaseItemSchema } from "@/lib/validations/game";
import { WebAuthnUtils } from "@/lib/webauthn-utils";
import type { TransactionPayload } from "@/lib/WebAuthnTransactionSigner";
import { WebAuthnTransactionSigner } from "@/lib/WebAuthnTransactionSigner";
import { logger } from "@/utils/logger";
import { Connection, PublicKey, clusterApiUrl, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

interface ItemDefinition {
  id: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  dataAiHint?: string;
}

interface AuthenticatedItem extends ItemDefinition {
  instanceId: string;
}

interface WebAuthnResponse {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

interface WebAuthnAuthData {
  payload: TransactionPayload & { itemId: string; quantity: number };
  response: WebAuthnResponse;
}

interface StepUpParams {
  userPublicKey: string;
  authData: WebAuthnAuthData;
  requestedItemId: string;
  requestedQuantity: number;
  origin: string;
}

/**
 * Analyzes transaction balances to verify token transfer.
 */
function analyzeBalances(transaction: ParsedTransactionWithMeta): { amount: number; mint: string } {
  const { meta } = transaction;
  const postBalances = meta?.postTokenBalances;
  const preBalances = meta?.preTokenBalances;

  if (postBalances && preBalances) {
    for (const post of postBalances) {
      const { accountIndex, owner, mint, uiTokenAmount: postAmount } = post;
      const pre = preBalances.find((pb) => pb.accountIndex === accountIndex);
      const preAmount = pre?.uiTokenAmount;

      if (postAmount?.uiAmount !== undefined && preAmount?.uiAmount !== undefined) {
        const diff = (postAmount.uiAmount || 0) - (preAmount.uiAmount || 0);
        if (diff > 0 && owner === STORE_TREASURY_WALLET_ADDRESS) {
          return { amount: diff, mint };
        }
      }
    }
  }
  return { amount: 0, mint: "" };
}

/**
 * Verifies a Solana transaction for correct recipient, token mint, and amount.
 */
async function verifySolanaTransaction(
  signature: string,
  userPublicKey: string,
  expectedAmount: number
): Promise<{ success: boolean; error?: string; code: number }> {
  const connection = new Connection(DEDICATED_RPC_ENDPOINT || clusterApiUrl("mainnet-beta"), "confirmed");
  let transaction: ParsedTransactionWithMeta | null = null;

  for (let i = 0; i < 6; i++) {
    try {
      /* eslint-disable-next-line no-await-in-loop */
      transaction = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });
      if (transaction) break;
    } catch (err) {
      logger.error(`[Solana] Attempt ${i + 1} failed:`, err as Error);
    }
    /* eslint-disable-next-line no-await-in-loop */
    if (i < 5) await new Promise(r => setTimeout(r, 5000));
  }

  if (!transaction) return { success: false, error: "Transaction not found.", code: 404 };
  if (transaction.meta?.err) return { success: false, error: "Blockchain transaction failed.", code: 400 };

  const sender = transaction.transaction.message.accountKeys[0]?.pubkey.toBase58();
  if (sender !== userPublicKey) return { success: false, error: "Sender mismatch.", code: 400 };

  const { amount, mint } = analyzeBalances(transaction);
  if (mint !== BOBY_TOKEN_MINT_ADDRESS) return { success: false, error: "Invalid token.", code: 400 };
  if (amount < expectedAmount) return { success: false, error: "Insufficient payment.", code: 400 };

  return { success: true, code: 200 };
}

/**
 * Handles WebAuthn signature verification for high-value purchases.
 */
async function verifyStepUpAuth(params: StepUpParams): Promise<{ success: boolean; error?: string }> {
  const { userPublicKey, authData, requestedItemId, requestedQuantity, origin } = params;
  const db = getFirestore();
  const passkeys = await db.collection("players").doc(userPublicKey).collection("passkeys").get();
  
  if (passkeys.empty) return { success: false, error: "Passkey required." };

  const { payload, response } = authData;
  if (payload.itemId !== requestedItemId || Number(payload.quantity) !== requestedQuantity) {
    return { success: false, error: "Verification data mismatch." };
  }

  const challenge = WebAuthnTransactionSigner.generateTransactionChallenge(payload);
  for (const doc of passkeys.docs) {
    /* eslint-disable-next-line no-await-in-loop */
    const matched = await WebAuthnUtils.verifyAuthenticationResponse(
      doc.data() as { id: string; publicKey: string; counter: number; userId: string },
      response,
      challenge,
      origin
    );
    if (matched) return { success: true };
  }

  return { success: false, error: "Security verification failed." };
}

/**
 * Updates player inventory with new items.
 */
async function addItemsToPlayer(userPublicKey: string, item: ItemDefinition, quantity: number): Promise<AuthenticatedItem[]> {
  const db = getFirestore();
  const newItems: AuthenticatedItem[] = Array(quantity).fill(null).map(() => ({
    ...item,
    instanceId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }));

  await db.collection("players").doc(userPublicKey).update({ 
    inventory: FieldValue.arrayUnion(...newItems), 
    updatedAt: FieldValue.serverTimestamp() 
  });

  return newItems;
}

/**
 * Main logic for processing a purchase after validation.
 */
async function processPurchase(
  userPublicKey: string,
  data: { itemId: string; quantity: number; transactionSignature: string; transactionAuthSignature?: WebAuthnAuthData },
  origin: string
): Promise<{ error?: string; status?: number; newItems?: AuthenticatedItem[] }> {
  const { itemId, quantity, transactionSignature, transactionAuthSignature } = data;
  const allItems = (await getActiveStoreItems()) as ItemDefinition[];
  const item = allItems.find((i) => i.id === itemId);
  if (!item) return { error: "Invalid item", status: 400 };

  const db = getFirestore();
  const usedRef = db.collection("usedTransactionSignatures").doc(transactionSignature);
  if ((await usedRef.get()).exists) return { error: "Signature reused", status: 409 };

  const expectedAmount = item.price * quantity;
  const verify = await verifySolanaTransaction(transactionSignature, userPublicKey, expectedAmount);
  if (!verify.success) return { error: verify.error ?? "Verification failed", status: verify.code };

  if (expectedAmount > 50000 || transactionAuthSignature) {
    if (!transactionAuthSignature) return { error: "Step-up auth required", status: 403 };
    const stepUp = await verifyStepUpAuth({
      userPublicKey,
      authData: transactionAuthSignature,
      requestedItemId: itemId,
      requestedQuantity: quantity,
      origin,
    });
    if (!stepUp.success) return { error: stepUp.error ?? "Security check failed", status: 401 };
  }

  await usedRef.set({ userId: userPublicKey, timestamp: FieldValue.serverTimestamp(), itemId, quantity });
  const newItems = await addItemsToPlayer(userPublicKey, item, quantity);
  return { newItems };
}

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  logger.log("[API] /api/game/purchaseItem called");
  const userPublicKey = request.user?.sub;
  if (!userPublicKey) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  try {
    try {
      new PublicKey(userPublicKey);
    } catch {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
    }

    if (!STORE_TREASURY_WALLET_ADDRESS || !BOBY_TOKEN_MINT_ADDRESS) {
      return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    const parse = PurchaseItemSchema.safeParse(await request.json());
    if (!parse.success) return NextResponse.json({ error: "Invalid params" }, { status: 400 });

    const purchaseData = {
      itemId: parse.data.itemId,
      quantity: parse.data.quantity,
      transactionSignature: parse.data.transactionSignature,
      ...(parse.data.transactionAuthSignature && { transactionAuthSignature: parse.data.transactionAuthSignature as WebAuthnAuthData })
    };

    await initializeAdminApp();
    const result = await processPurchase(userPublicKey, purchaseData, request.headers.get("origin") || "");
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status as number });
    }

    const res = NextResponse.json({ message: "Purchase successful", newItems: result.newItems });
    return await setCsrfTokenResponse(res, userPublicKey, request.headers.get("host") || undefined);
  } catch (error) {
    logger.error("Purchase error:", error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}));
