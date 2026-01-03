// src/app/api/game/purchaseHistory/route.ts
import { logger } from 'utils/logger';
// API endpoint to fetch user's purchase history

import { NextResponse } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';

export interface PurchaseRecord {
    id: string;
    itemId: string;
    itemName: string;
    quantity: number;
    transactionSignature: string;
    explorerUrl: string;
    timestamp: Date;
    amountPaid?: number;
}

export const GET = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
    logger.log("[API] /api/game/purchaseHistory called");

    const userPublicKey = request.user?.sub;

    if (!userPublicKey) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    try {
        await initializeAdminApp();
        const db = getFirestore();

        // Query used transaction signatures for this user
        const signaturesSnapshot = await db
            .collection('usedTransactionSignatures')
            .where('userId', '==', userPublicKey)
            .orderBy('timestamp', 'desc')
            .limit(50) // Limit to last 50 purchases
            .get();

        const purchases: PurchaseRecord[] = [];

        for (const doc of signaturesSnapshot.docs) {
            const data = doc.data();
            const signature = doc.id;

            // Determine cluster for explorer URL
            const isDevnet = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.includes('devnet');
            const explorerUrl = `https://solscan.io/tx/${signature}${isDevnet ? '?cluster=devnet' : ''}`;

            purchases.push({
                id: doc.id,
                itemId: data.itemId || 'unknown',
                itemName: data.itemName || data.itemId || 'Unknown Item',
                quantity: data.quantity || 1,
                transactionSignature: signature,
                explorerUrl,
                timestamp: data.timestamp?.toDate() || new Date(),
                amountPaid: data.amountPaid,
            });
        }

        return NextResponse.json({
            success: true,
            purchases,
            total: purchases.length,
        });

    } catch (error) {
        logger.error("[API] Error fetching purchase history:", error as Error);
        return NextResponse.json(
            { error: 'Failed to fetch purchase history.' },
            { status: 500 }
        );
    }
}));
