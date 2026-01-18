/**
 * WebAuthn Manage Passkeys Route
 * GET /api/auth/webauthn/manage
 */

import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { WebAuthnService } from '@/lib/webauthn-service';
import { logger } from '@/utils/logger';
import { NextResponse } from 'next/server';

/**
 * Returns a sanitized list of passkeys for the authenticated user.
 * Sensitive data like raw public keys are removed in the service layer.
 */
export const GET = withAuth(async (request: AuthenticatedRequest) => {
    try {
        const userId = request.user.sub;

        if (!userId) {
            return NextResponse.json({ error: 'Authenticated UserID required' }, { status: 401 });
        }

        const passkeys = await WebAuthnService.listUserPasskeys(userId);

        return NextResponse.json({ success: true, passkeys });
    } catch (error) {
        logger.error('[WebAuthn Manage GET] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
