/**
 * Helpers for Fetch Player Data logic
 */

import type { PlayerDocument } from '@/types/database';
import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

/**
 * Creates initial player data document
 */
export function createInitialPlayerData(userPublicKey: string): PlayerDocument {
    return {
        publicKey: userPublicKey,
        gameUSDTBalance: 0,
        inventory: [],
        lastInteraction: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        lastLogin: FieldValue.serverTimestamp()
    };
}

/**
 * Standardizes error responses for player data fetching
 */
export function handleFetchError(error: unknown): NextResponse {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    let status = 500;

    if (message.includes('Authentication required')) status = 401;
    else if (message.includes('not found')) status = 404;
    else if (message.includes('Firebase Admin')) status = 500;

    return NextResponse.json({ error: message }, { status });
}
