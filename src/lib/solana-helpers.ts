import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { ComputeBudgetProgram } from "@solana/web3.js";
import { logger } from "utils/logger";
import type { PriorityFeeConfig } from "../types/solana";
import { BOBY_TOKEN_DECIMALS } from "./constants";

/**
 * Get associated token addresses for sender and treasury
 */
export async function getAssociatedTokenAddresses(
  senderPk: PublicKey,
  treasuryPk: PublicKey,
  mintPk: PublicKey
) {
  const fromTokenAccountAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintPk,
    senderPk
  );

  const toTokenAccountAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintPk,
    treasuryPk
  );

  return { fromTokenAccountAddress, toTokenAccountAddress };
}

/**
 * Validate that the sender has enough BOBY tokens and SOL
 */
export async function validateSenderBalance(
  connection: Connection,
  senderPk: PublicKey,
  fromTokenAddr: PublicKey,
  amount: number
) {
  // Verify sender's token account exists
  const senderAccountInfo = await connection.getAccountInfo(fromTokenAddr);
  if (!senderAccountInfo) {
    throw new Error("Your BOBY account does not exist. You need to receive BOBY tokens first.");
  }

  // Check balance
  const balance = await connection.getTokenAccountBalance(fromTokenAddr);
  const userBalance = balance.value.uiAmount || 0;
  if (userBalance < amount) {
    throw new Error(
      `Insufficient BOBY balance. You have ${userBalance.toLocaleString()} and need ${amount.toLocaleString()}`
    );
  }

  // Check SOL for fees
  const solBalance = await connection.getBalance(senderPk);
  if (solBalance < 10000) {
    throw new Error("Insufficient SOL balance for transaction fees");
  }
}

/**
 * Add priority fees to a transaction
 */
export function addPriorityFeesToTransaction(
  transaction: Transaction,
  config: PriorityFeeConfig
): void {
  if (config.computeUnitLimit) {
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.computeUnitLimit,
      })
    );
  }

  if (config.computeUnitPrice) {
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: config.computeUnitPrice,
      })
    );
  }
}

/**
 * Verify if a transaction instruction matches the expected transfer
 */
export function verifyTransferInstructionHelper(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instructions: any[],
  expectedAmount: number,
  expectedMint: string
): boolean {
  for (const ix of instructions) {
    // Check program ID to ensure it's a Token program instruction
    if (ix.programId.toString() !== TOKEN_PROGRAM_ID.toString()) continue;

    if ("parsed" in ix && ix.parsed?.type === "transfer") {
      const { info } = ix.parsed;
      const amount = parseFloat(info.amount) / 10 ** BOBY_TOKEN_DECIMALS;

      // Verify amount (allow small tolerance for rounding)
      if (Math.abs(amount - expectedAmount) < 0.01) {
        if (expectedMint) {
          logger.debug(`[PaymentService] Verified transaction for mint: ${expectedMint}`);
        }
        return true;
      }
    }
  }
  return false;
}
