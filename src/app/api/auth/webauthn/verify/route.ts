/**
 * WebAuthn Verify (Login) Route
 * POST /api/auth/webauthn/verify
 */

import { sessionManager } from '@/lib/advancedSessionManager';
import { auditLogger } from '@/lib/audit-logger';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { db } from '@/lib/firebase-admin';
import redis from '@/lib/redis';
import { securityIntegration } from '@/lib/securityIntegration';
import { validateRequestBody, WebAuthnVerifySchema } from '@/lib/validation-schemas';
import { logger } from '@/utils/logger';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bindSessionToCookies, getWebAuthnChallengeKey, issueTokensAndCookies, resolveUserFromDiscovery, verifyPasskeySignature } from './verifyHelpers';

export async function POST(request: NextRequest) {
    try {
        const { userId, credentialResponse } = await validateRequestBody(request, WebAuthnVerifySchema);
        const ip = request.headers.get('x-forwarded-for') || 'unknown';
        let fuid = userId;

        const { discoveryId, id: cid, response: cresp } = credentialResponse;
        const ckey = getWebAuthnChallengeKey(fuid, discoveryId);
        const challenge = await redis.get(ckey);
        if (!challenge) return NextResponse.json({ error: 'Authentication session expired' }, { status: 400 });

        if (!fuid && !(fuid = await resolveUserFromDiscovery(cid))) {
            return NextResponse.json({ error: 'Biometric device not recognized' }, { status: 403 });
        }

        const doc = await db.collection('players').doc(fuid).collection('passkeys').doc(cid).get();
        if (!doc.exists) {
            await auditLogger.logPasskeyLoginFailure({ userId: fuid, ipAddress: ip }, 'Credential not recognized');
            return NextResponse.json({ error: 'Device not recognized' }, { status: 403 });
        }

        const isOk = await verifyPasskeySignature({ credentialData: doc.data()!, credentialId: cid, response: cresp, storedChallenge: challenge, origin: request.headers.get('origin') || '', userId: fuid });
        if (!isOk) {
            await auditLogger.logPasskeyLoginFailure({ userId: fuid, ipAddress: ip }, 'Invalid biometric signature');
            return NextResponse.json({ error: 'Verification failed' }, { status: 401 });
        }

        const rhost = request.headers.get('host') || '';
        const resp = NextResponse.json({ success: true, message: 'Login successful', publicKey: fuid });
        issueTokensAndCookies({ publicKey: fuid, requestHost: rhost, response: resp });

        const sess = await sessionManager.createSecureSession(fuid, securityIntegration.extractDeviceInfo(request), { authMethod: 'biometric', credentialId: cid });
        if (sess) bindSessionToCookies({ sessionId: sess.sessionId, currentSeed: sess.currentSeed, requestHost: rhost, response: resp });

        await redis.del(ckey);
        return await setCsrfTokenResponse(resp, fuid, rhost);
    } catch (error) {
        logger.error('[WebAuthn Verify] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
