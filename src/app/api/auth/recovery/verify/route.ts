/**
 * Account Recovery Verification API Route
 * Handles verification of recovery code and reset of passkeys
 */

import { auditLogger } from '@/lib/audit-logger';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { RecoveryService } from '@/lib/recovery-service';
import { getClientIp } from '@/lib/request-utils';
import { RecoveryCancelSchema, RecoveryVerifySchema, validateRequestBody } from '@/lib/validation-schemas';
import { logger } from '@/utils/logger';
import { NextResponse } from 'next/server';

/**
 * POST /api/auth/recovery/verify
 * Verifies recovery code and allows passkey reset
 */
export const POST = withCsrfProtection(async (request: Request) => {
    try {
        const { recoveryToken, recoveryCode } = await validateRequestBody(request, RecoveryVerifySchema);
        
        const metadata = {
            ipAddress: getClientIp(request),
            userAgent: request.headers.get('user-agent') || 'unknown',
            endpoint: '/api/auth/recovery/verify'
        };

        const recoveryState = await RecoveryService.getRecoveryState(recoveryToken);
        if (!recoveryState) {
            return NextResponse.json({ error: 'Recovery token expired or invalid' }, { status: 400 });
        }

        if (recoveryState.recoveryCode !== recoveryCode) {
            await auditLogger.logEvent('SUSPICIOUS_ACTIVITY', 'Invalid recovery code attempt', { ...metadata, userId: recoveryState.publicKey }, 'warn');
            return NextResponse.json({ error: 'Invalid recovery code' }, { status: 400 });
        }

        // Cooldown is already enforced at initiate step via RECOVERY_COOLDOWN in Redis

        const success = await RecoveryService.resetAccount(recoveryToken, recoveryState, metadata);
        if (!success) return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });

        return NextResponse.json({
            success: true,
            message: 'Recovery verified. Your account has been reset. You can now set up a new passkey.',
            recoveryToken: crypto.randomUUID() // New token for passkey enrollment
        });
    } catch (error) {
        logger.error('[Recovery Verify] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

/**
 * DELETE /api/auth/recovery/cancel
 * Cancels recovery process
 */
export const DELETE = withCsrfProtection(async (request: Request) => {
    try {
        const { recoveryToken } = await validateRequestBody(request, RecoveryCancelSchema);
        
        const metadata = {
            ipAddress: getClientIp(request),
            userAgent: request.headers.get('user-agent') || 'unknown',
            endpoint: '/api/auth/recovery/cancel'
        };

        const recoveryState = await RecoveryService.getRecoveryState(recoveryToken);
        if (recoveryState) {
            await RecoveryService.cancelRecovery(recoveryToken, recoveryState.publicKey, metadata);
        }

        return NextResponse.json({ success: true, message: 'Recovery cancelled' });
    } catch (error) {
        logger.error('[Recovery Cancel] Error:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
