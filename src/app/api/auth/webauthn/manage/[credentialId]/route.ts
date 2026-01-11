/**
 * WebAuthn Delete Passkey Route
 * DELETE /api/auth/webauthn/manage/[credentialId]
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/utils/logger';

export const DELETE = withAuth(withCsrfProtection(async (request: AuthenticatedRequest, { params }: { params: { credentialId: string } }) => {
    try {
        const userId = request.user.sub; // Get userId from authenticated session
        const { credentialId } = params; // Get credentialId from URL parameters

        if (!userId) {
            return NextResponse.json({ error: 'Authenticated UserID required' }, { status: 401 });
        }

        if (!credentialId) {
            return NextResponse.json({ error: 'Credential ID is required' }, { status: 400 });
        }

        // Check if this is the last passkey for the user
        const passkeysSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();
        if (passkeysSnapshot.size <= 1) {
            return NextResponse.json(
                { error: 'Cannot delete the last passkey. Please set up account recovery or another passkey first.' },
                { status: 400 }
            );
        }

        // Verify that the passkey belongs to the user and then delete it
        const passkeyRef = db.collection('players').doc(userId).collection('passkeys').doc(credentialId);
        const passkeyDoc = await passkeyRef.get();

        if (!passkeyDoc.exists) {
            return NextResponse.json({ error: 'Passkey not found or does not belong to user' }, { status: 404 });
        }

        await passkeyRef.delete();

        return NextResponse.json({ success: true, message: 'Passkey deleted successfully' });
    } catch (error) {
        logger.error('[WebAuthn Manage DELETE] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}));
