// src/lib/solanaPaymentService.ts
import { logger } from "utils/logger";
// Centralized Solana Payment Service for professional transaction handling

import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import type { TransactionSignature } from "@solana/web3.js";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  BOBY_TOKEN_DECIMALS,
  BOBY_TOKEN_MINT_ADDRESS,
  SOL_NETWORK,
  STORE_TREASURY_WALLET_ADDRESS,
} from "../constants";

// Token decimals

import {
  addPriorityFeesToTransaction,
  getAssociatedTokenAddresses,
  validateSenderBalance,
  verifyTransferInstructionHelper,
} from "./solana-helpers";

import type {
  PriorityFeeConfig,
  PurchasePhase,
  PurchaseProgress,
  TransactionResult,
} from "../../types/solana";

export type { PriorityFeeConfig, PurchasePhase, PurchaseProgress, TransactionResult };

class SolanaPaymentService {
  private connection: Connection;
  private isMobile: boolean;

  constructor() {
    this.connection = new Connection(SOL_NETWORK, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 60000,
    });
    this.isMobile =
      typeof window !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  /**
   * Get the Solana connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get Solana Explorer URL for a transaction
   */
  getExplorerUrl(signature: string): string {
    const cluster = SOL_NETWORK.includes("devnet") ? "?cluster=devnet" : "";
    return `https://solscan.io/tx/${signature}${cluster}`;
  }

  /**
   * Estimate priority fees based on recent network conditions
   */
  async estimatePriorityFees(): Promise<PriorityFeeConfig> {
    try {
      // Get recent prioritization fees
      const recentFees = await this.connection.getRecentPrioritizationFees();

      if (recentFees.length > 0) {
        // Calculate median fee
        const sortedFees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
        const medianFee = sortedFees[Math.floor(sortedFees.length / 2)] ?? 0;

        // Use 1.5x median for faster inclusion
        const recommendedFee = Math.max(medianFee * 1.5, 1000); // Minimum 1000 microLamports

        return {
          computeUnitLimit: 200000, // Standard limit
          computeUnitPrice: Math.round(recommendedFee),
        };
      }
    } catch (error) {
      logger.warn("[PaymentService] Failed to estimate priority fees:", error);
    }

    // Default fallback
    return {
      computeUnitLimit: 200000,
      computeUnitPrice: 5000, // 5000 microLamports default
    };
  }

  /**
   * Add priority fee instructions to a transaction
   */
  addPriorityFees(transaction: Transaction, config: PriorityFeeConfig): void {
    addPriorityFeesToTransaction(transaction, config);
  }

  /**
   * Build a token transfer transaction with priority fees
   */
  async buildTransferTransaction(
    senderPublicKey: PublicKey,
    amount: number, // In token units
    onProgress?: (progress: PurchaseProgress) => void
  ): Promise<Transaction> {
    onProgress?.({ phase: "preparing", message: "Preparing transaction..." });

    if (!STORE_TREASURY_WALLET_ADDRESS)
      throw new Error("STORE_TREASURY_WALLET_ADDRESS is not configured");
    const mintPk = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);
    const treasuryPk = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);

    const addresses = await getAssociatedTokenAddresses(senderPublicKey, treasuryPk, mintPk);
    await validateSenderBalance(
      this.connection,
      senderPublicKey,
      addresses.fromTokenAccountAddress,
      amount
    );

    const transaction = new Transaction();
    await this._addPriorityFeesWithLogging(transaction);
    await this._ensureTreasuryAccount({
      transaction,
      toTokenAddr: addresses.toTokenAccountAddress,
      treasuryPk,
      senderPk: senderPublicKey,
      mintPk,
    });

    this._addTransferInstruction({
      transaction,
      fromAddr: addresses.fromTokenAccountAddress,
      toAddr: addresses.toTokenAccountAddress,
      senderPk: senderPublicKey,
      amount,
    });

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash("finalized");
    Object.assign(transaction, {
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      feePayer: senderPublicKey,
    });
    return transaction;
  }

  private async _addPriorityFeesWithLogging(transaction: Transaction) {
    const priorityFees = await this.estimatePriorityFees();
    this.addPriorityFees(transaction, priorityFees);
    logger.log(`[PaymentService] Priority fees: ${priorityFees.computeUnitPrice} microLamports`);
  }

  private _addTransferInstruction(config: {
    transaction: Transaction;
    fromAddr: PublicKey;
    toAddr: PublicKey;
    senderPk: PublicKey;
    amount: number;
  }) {
    const { transaction, fromAddr, toAddr, senderPk, amount } = config;
    const amountInSmallestUnit = Math.round(amount * 10 ** BOBY_TOKEN_DECIMALS);
    transaction.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        fromAddr,
        toAddr,
        senderPk,
        [],
        amountInSmallestUnit
      )
    );
  }

  // Helper methods moved to solana-helpers.ts to reduce file size
  // _getAssociatedTokenAddresses, _validateSenderBalance

  private async _ensureTreasuryAccount(config: {
    transaction: Transaction;
    toTokenAddr: PublicKey;
    treasuryPk: PublicKey;
    senderPk: PublicKey;
    mintPk: PublicKey;
  }) {
    const { transaction, toTokenAddr, treasuryPk, senderPk, mintPk } = config;
    const treasuryAccountInfo = await this.connection.getAccountInfo(toTokenAddr);
    if (!treasuryAccountInfo) {
      transaction.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          mintPk,
          toTokenAddr,
          treasuryPk,
          senderPk
        )
      );
    }
  }

  /**
   * Confirm a transaction using polling (more reliable than WebSocket)
   */
  async confirmTransaction(
    signature: TransactionSignature,
    onProgress?: (progress: PurchaseProgress) => void
  ): Promise<TransactionResult> {
    onProgress?.({
      phase: "confirming",
      message: "Confirming transaction on the network...",
      signature,
      explorerUrl: this.getExplorerUrl(signature),
    });

    const maxPolls = this.isMobile ? 45 : 30;
    const pollInterval = 2000;

    for (let i = 0; i < maxPolls; i++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      // eslint-disable-next-line no-await-in-loop
      const result = await this._checkSignatureStatus(signature, i + 1);
      if (result) return result;
    }

    return {
      success: false,
      signature,
      explorerUrl: this.getExplorerUrl(signature),
      error: "Transaction confirmation timeout. Please check your wallet.",
    };
  }

  private async _checkSignatureStatus(
    signature: string,
    attempt: number
  ): Promise<TransactionResult | null> {
    try {
      const statuses = await this.connection.getSignatureStatuses([signature]);
      const status = statuses?.value?.[0];

      if (status) {
        if (status.err) {
          return {
            success: false,
            signature,
            explorerUrl: this.getExplorerUrl(signature),
            error: `Transaction failed: ${JSON.stringify(status.err)}`,
          };
        }

        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          logger.log(
            `[PaymentService] Transaction confirmed (${status.confirmationStatus}) after ${attempt} polls`
          );
          return {
            success: true,
            signature,
            explorerUrl: this.getExplorerUrl(signature),
            confirmationStatus: status.confirmationStatus,
          };
        }
      }
    } catch (error) {
      logger.warn(`[PaymentService] Poll ${attempt} failed:`, error);
    }
    return null;
  }

  /**
   * Verify a transaction on-chain (for server-side verification)
   */
  async verifyTransaction(
    signature: string,
    expectedSender: string,
    expectedAmount: number, // In token units
    expectedMint: string = BOBY_TOKEN_MINT_ADDRESS
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return { valid: false, error: "Transaction not found on-chain" };
      }

      if (tx.meta?.err) {
        return { valid: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
      }

      // Verify sender (fee payer or first signer)
      const { accountKeys } = tx.transaction.message;
      if (!accountKeys || accountKeys.length === 0 || !accountKeys[0]) {
        return { valid: false, error: "Transaction has no account keys" };
      }
      const senderKey = accountKeys[0].pubkey.toString();
      if (senderKey !== expectedSender) {
        return {
          valid: false,
          error: `Sender mismatch: expected ${expectedSender}, got ${senderKey}`,
        };
      }

      // Find token transfer instruction
      const transferFound = verifyTransferInstructionHelper(
        tx.transaction.message.instructions,
        expectedAmount,
        expectedMint
      );

      if (!transferFound) {
        return { valid: false, error: "Transfer instruction not found or amount mismatch" };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Verification failed: ${error}` };
    }
  }

  // _verifyTransferInstruction moved to solana-helpers.ts
}

// Singleton instance
export const solanaPaymentService = new SolanaPaymentService();
