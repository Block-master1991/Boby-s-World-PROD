/**
 * Helpers for Purchase History logic
 */

import type { TransactionSignatureDocument } from '@/types/database';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';

export interface PurchaseRecord {
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    transactionSignature: string;
    explorerUrl: string;
    timestamp: Date;
    amountPaid?: number | undefined;
}

/**
 * Generates Solscan explorer URL based on environment
 */
export function getExplorerUrl(signature: string): string {
    const rpcUrl = process.env['NEXT_PUBLIC_SOLANA_RPC_URL'] || '';
    const isDevnet = rpcUrl.includes('devnet');
    return `https://solscan.io/tx/${signature}${isDevnet ? '?cluster=devnet' : ''}`;
}

/**
 * Maps Firestore document data to PurchaseRecord
 */
export function mapToPurchaseRecord(id: string, data: TransactionSignatureDocument): PurchaseRecord {
    const { itemId, itemName, quantity, amountPaid, timestamp } = data;
    let date: Date;

    if (timestamp instanceof AdminTimestamp) {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
    } else {
        date = new Date();
    }

    return {
        id: id,
        itemId: itemId || 'unknown',
        itemName: itemName || itemId || 'Unknown Item',
        quantity: quantity || 1,
        transactionSignature: id,
        explorerUrl: getExplorerUrl(id),
        timestamp: date,
        amountPaid: amountPaid,
    };
}
