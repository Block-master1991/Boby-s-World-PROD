/**
 * WebAuthn Manage Passkeys Route
 * GET /api/auth/webauthn/manage
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { logger } from '@/utils/logger';

// Define the actual handler function
const handler = async (request: AuthenticatedRequest) => {
    try {
        const userId = request.user.sub; // Get userId from authenticated session

        if (!userId) {
            return NextResponse.json({ error: 'Authenticated UserID required' }, { status: 401 });
        }

        const passkeysSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();
        const passkeys = passkeysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Include document ID

        logger.log("Returning passkeys:", passkeys); // Debugging line
        return NextResponse.json({ success: true, passkeys: passkeys }); // Explicitly pass passkeys object
    } catch (error) {
        logger.error('[WebAuthn Manage GET] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

// Export the handler wrapped with middleware
export const GET = withAuth(handler);
