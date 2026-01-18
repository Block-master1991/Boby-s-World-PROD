import { withAdminAuth } from '@/lib/admin-middleware';
import { db, initializeAdminApp } from '@/lib/firebase-admin';
import type { PlayerDocument } from '@/types/database';
import { logger } from '@/utils/logger';
import type * as admin from 'firebase-admin';
import { NextResponse } from 'next/server';

async function initializeFirebase(): Promise<NextResponse | null> {
    try {
        await initializeAdminApp();
        return null;
    } catch (initError) {
        logger.error('Firebase Admin SDK initialization failed:', initError instanceof Error ? initError.message : String(initError));
        return NextResponse.json({
            error: 'Firebase Admin SDK initialization failed. Check server logs for details.',
            details: process.env['NODE_ENV'] === 'development' ? (initError instanceof Error ? initError.message : 'Unknown error') : undefined
        }, { status: 500 });
    }
}

function countOnlineUsers(snapshot: admin.firestore.QuerySnapshot, onlineThreshold: number): number {
    const now = Date.now();
    let onlineUsers = 0;
    snapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
        const { lastInteraction } = doc.data() as Partial<PlayerDocument>;
        if (lastInteraction && typeof (lastInteraction as admin.firestore.Timestamp).toDate === 'function') {
            const lastInteractionTime = (lastInteraction as admin.firestore.Timestamp).toDate().getTime();
            if (now - lastInteractionTime < onlineThreshold) {
                onlineUsers++;
            }
        }
    });
    return onlineUsers;
}

export const GET = withAdminAuth(async () => {
    try {
        const initError = await initializeFirebase();
        if (initError) return initError;

        const playersRef = db.collection('players');
        logger.log('Attempting to fetch players from collection:', playersRef.path);
        const snapshot = await playersRef.get();
        const totalUsers = snapshot.size;
        logger.log('Total players fetched:', totalUsers);
        if (totalUsers === 0) logger.warn('No documents found in the "players" collection.');

        const onlineUsers = countOnlineUsers(snapshot, 30 * 1000);
        const offlineUsers = totalUsers - onlineUsers;
        logger.log('Online users:', onlineUsers, 'Offline users:', offlineUsers);

        return NextResponse.json({ totalUsers, onlineUsers, offlineUsers });
    } catch (error) {
        logger.error('Error fetching user statistics:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({
            error: 'Failed to fetch user statistics.',
            details: process.env['NODE_ENV'] === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
        }, { status: 500 });
    }
});
