import { BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from "@/lib/constants";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Connection } from "@solana/web3.js";
import { PublicKey, Transaction } from "@solana/web3.js";

const BOBY_TOKEN_DECIMALS = 6;

/**
 * Validates and retrieves required token addresses
 */
const getTokenAddresses = async (adapterPublicKey: PublicKey) => {
  const bobyMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
  const treasuryPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS!);

  const fromAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    bobyMintPublicKey,
    adapterPublicKey
  );
  const toAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    bobyMintPublicKey,
    treasuryPublicKey
  );

  return { bobyMintPublicKey, treasuryPublicKey, fromAddress, toAddress };
};

/**
 * Builds a Solana transaction for BOBY token transfer
 */
export const buildBobyPurchaseTransaction = async (
  connection: Connection,
  adapterPublicKey: PublicKey,
  amount: number
): Promise<Transaction> => {
  if (!STORE_TREASURY_WALLET_ADDRESS) throw new Error("Treasury not set.");

  const addr = await getTokenAddresses(adapterPublicKey);

  const fromInfo = await connection.getAccountInfo(addr.fromAddress).catch(() => null);
  if (!fromInfo) throw new Error("BOBY account missing.");

  const balance = (await connection.getTokenAccountBalance(addr.fromAddress)).value.uiAmount ?? 0;
  if (balance < amount) throw new Error("Insufficient BOBY.");

  if ((await connection.getBalance(adapterPublicKey).catch(() => 0)) < 10000) {
    throw new Error("Insufficient SOL.");
  }

  const tx = new Transaction();
  if (!(await connection.getAccountInfo(addr.toAddress).catch(() => null))) {
    tx.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        addr.bobyMintPublicKey,
        addr.toAddress,
        addr.treasuryPublicKey,
        adapterPublicKey
      )
    );
  }

  tx.add(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      addr.fromAddress,
      addr.toAddress,
      adapterPublicKey,
      [],
      Math.round(amount * 10 ** BOBY_TOKEN_DECIMALS)
    )
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
  Object.assign(tx, {
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    feePayer: adapterPublicKey,
  });

  return tx;
};

/**
 * Polls for transaction confirmation (Recursive to satisfy no-await-in-loop)
 */
export const pollTransactionConfirmation = async (
  connection: Connection,
  signature: string,
  remainingRetries: number = 30
): Promise<boolean> => {
  if (remainingRetries <= 0) return false;

  await new Promise(r => setTimeout(r, 2000));

  const res = await connection.getSignatureStatuses([signature]);
  const status = res.value?.[0];

  if (status?.err) throw new Error(`Tx Error: ${JSON.stringify(status.err)}`);
  if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
    return true;
  }

  return pollTransactionConfirmation(connection, signature, remainingRetries - 1);
};

/**
 * Backend verification types
 */
export interface AuthSig {
  id: string;
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle: string | null;
  };
  payload: {
    action: string;
    itemId: string;
    quantity: number;
    amount: number;
    timestamp: number;
    nonce: string;
  };
}

export interface VerificationPayload {
  itemId: string;
  quantity: number;
  transactionSignature: string;
  transactionAuthSignature: AuthSig | undefined;
  purchaseVerificationToken?: string | undefined;
}

interface VerifyResponse {
  ok: boolean;
  data: { message?: string; error?: string; code?: string };
}

/**
 * Verifies purchase with backend API
 */
export const verifyPurchaseWithBackend = async (
  apiFetch: (url: string, options: RequestInit) => Promise<Response>,
  payload: VerificationPayload,
  isMobile: boolean
): Promise<VerifyResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), isMobile ? 45000 : 30000);

  try {
    const response = await apiFetch("/api/game/purchaseItem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    return { ok: response.ok, data };
  } finally {
    clearTimeout(timeout);
  }
};
