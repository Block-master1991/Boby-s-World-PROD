// src/lib/solanaPaymentService.ts
import { logger } from 'utils/logger';
// Centralized Solana Payment Service for professional transaction handling

import { Connection, Transaction, PublicKey, ComputeBudgetProgram, TransactionSignature } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SOL_NETWORK, BOBY_TOKEN_MINT_ADDRESS, STORE_TREASURY_WALLET_ADDRESS } from './constants';

// Token decimals
const BOBY_TOKEN_DECIMALS = 6;

// Purchase phases for UI
export type PurchasePhase =
    | 'idle'
    | 'preparing'
    | 'awaiting_signature'
    | 'sending'
    | 'confirming'
    | 'verifying'
    | 'complete'
    | 'error';

export interface PurchaseProgress {
    phase: PurchasePhase;
    message: string;
    signature?: string;
    explorerUrl?: string;
    error?: string;
}

export interface TransactionResult {
    success: boolean;
    signature?: string;
    explorerUrl?: string;
    error?: string;
    confirmationStatus?: string;
}

export interface PriorityFeeConfig {
    computeUnitLimit?: number;
    computeUnitPrice?: number; // microLamports per compute unit
}

class SolanaPaymentService {
    private connection: Connection;
    private isMobile: boolean;

    constructor() {
        this.connection = new Connection(SOL_NETWORK, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000,
        });
        this.isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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
        const cluster = SOL_NETWORK.includes('devnet') ? '?cluster=devnet' : '';
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
                const sortedFees = recentFees
                    .map(f => f.prioritizationFee)
                    .sort((a, b) => a - b);
                const medianFee = sortedFees[Math.floor(sortedFees.length / 2)];

                // Use 1.5x median for faster inclusion
                const recommendedFee = Math.max(medianFee * 1.5, 1000); // Minimum 1000 microLamports

                return {
                    computeUnitLimit: 200000, // Standard limit
                    computeUnitPrice: Math.round(recommendedFee),
                };
            }
        } catch (error) {
            logger.warn('[PaymentService] Failed to estimate priority fees:', error);
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
        // Set compute unit limit
        if (config.computeUnitLimit) {
            transaction.add(
                ComputeBudgetProgram.setComputeUnitLimit({
                    units: config.computeUnitLimit,
                })
            );
        }

        // Set compute unit price (priority fee)
        if (config.computeUnitPrice) {
            transaction.add(
                ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: config.computeUnitPrice,
                })
            );
        }
    }

    /**
     * Build a token transfer transaction with priority fees
     */
    async buildTransferTransaction(
        senderPublicKey: PublicKey,
        amount: number, // In token units (not smallest unit)
        onProgress?: (progress: PurchaseProgress) => void
    ): Promise<Transaction> {
        onProgress?.({ phase: 'preparing', message: 'Preparing transaction...' });

        const bobyMintPublicKey = new PublicKey(BOBY_TOKEN_MINT_ADDRESS);

        if (!STORE_TREASURY_WALLET_ADDRESS) {
            throw new Error('STORE_TREASURY_WALLET_ADDRESS is not configured');
        }
        const treasuryPublicKey = new PublicKey(STORE_TREASURY_WALLET_ADDRESS);

        // Get associated token accounts
        const fromTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            bobyMintPublicKey,
            senderPublicKey
        );

        const toTokenAccountAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            bobyMintPublicKey,
            treasuryPublicKey
        );

        // Verify sender's token account exists
        const senderAccountInfo = await this.connection.getAccountInfo(fromTokenAccountAddress);
        if (!senderAccountInfo) {
            throw new Error('Your BOBY account does not exist. You need to receive BOBY tokens first.');
        }

        // Check balance
        const balance = await this.connection.getTokenAccountBalance(fromTokenAccountAddress);
        const userBalance = balance.value.uiAmount || 0;
        if (userBalance < amount) {
            throw new Error(`Insufficient BOBY balance. You have ${userBalance.toLocaleString()} and need ${amount.toLocaleString()}`);
        }

        // Check SOL for fees
        const solBalance = await this.connection.getBalance(senderPublicKey);
        if (solBalance < 10000) {
            throw new Error('Insufficient SOL balance for transaction fees');
        }

        // Create transaction
        const transaction = new Transaction();

        // Add priority fees
        const priorityFees = await this.estimatePriorityFees();
        this.addPriorityFees(transaction, priorityFees);
        logger.log(`[PaymentService] Priority fees: ${priorityFees.computeUnitPrice} microLamports`);

        // Check if treasury token account exists, create if needed
        const treasuryAccountInfo = await this.connection.getAccountInfo(toTokenAccountAddress);
        if (!treasuryAccountInfo) {
            transaction.add(
                Token.createAssociatedTokenAccountInstruction(
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                    TOKEN_PROGRAM_ID,
                    bobyMintPublicKey,
                    toTokenAccountAddress,
                    treasuryPublicKey,
                    senderPublicKey
                )
            );
        }

        // Add transfer instruction
        const amountInSmallestUnit = Math.round(amount * (10 ** BOBY_TOKEN_DECIMALS));
        transaction.add(
            Token.createTransferInstruction(
                TOKEN_PROGRAM_ID,
                fromTokenAccountAddress,
                toTokenAccountAddress,
                senderPublicKey,
                [],
                amountInSmallestUnit
            )
        );

        // Get fresh blockhash
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = senderPublicKey;

        return transaction;
    }

    /**
     * Confirm a transaction using polling (more reliable than WebSocket)
     */
    async confirmTransaction(
        signature: TransactionSignature,
        onProgress?: (progress: PurchaseProgress) => void
    ): Promise<TransactionResult> {
        onProgress?.({
            phase: 'confirming',
            message: 'Confirming transaction on the network...',
            signature,
            explorerUrl: this.getExplorerUrl(signature),
        });

        const maxPolls = this.isMobile ? 45 : 30; // More polls on mobile
        const pollInterval = 2000; // 2 seconds

        for (let i = 0; i < maxPolls; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));

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

                    if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                        logger.log(`[PaymentService] Transaction confirmed (${status.confirmationStatus}) after ${i + 1} polls`);
                        return {
                            success: true,
                            signature,
                            explorerUrl: this.getExplorerUrl(signature),
                            confirmationStatus: status.confirmationStatus,
                        };
                    }
                }
            } catch (error) {
                logger.warn(`[PaymentService] Poll ${i + 1} failed:`, error);
            }
        }

        return {
            success: false,
            signature,
            explorerUrl: this.getExplorerUrl(signature),
            error: 'Transaction confirmation timeout. Please check your wallet.',
        };
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
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
            });

            if (!tx) {
                return { valid: false, error: 'Transaction not found on-chain' };
            }

            if (tx.meta?.err) {
                return { valid: false, error: `Transaction failed: ${JSON.stringify(tx.meta.err)}` };
            }

            // Find token transfer instruction
            const instructions = tx.transaction.message.instructions;
            let transferFound = false;

            for (const ix of instructions) {
                if ('parsed' in ix && ix.program === 'spl-token' && ix.parsed?.type === 'transfer') {
                    const info = ix.parsed.info;
                    const amount = parseFloat(info.amount) / (10 ** BOBY_TOKEN_DECIMALS);

                    // Verify amount (allow small tolerance for rounding)
                    if (Math.abs(amount - expectedAmount) < 0.01) {
                        transferFound = true;
                        break;
                    }
                }
            }

            if (!transferFound) {
                return { valid: false, error: 'Transfer instruction not found or amount mismatch' };
            }

            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Verification failed: ${error}` };
        }
    }
}

// Singleton instance
export const solanaPaymentService = new SolanaPaymentService();
