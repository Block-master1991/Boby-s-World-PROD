import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { withAuth, AuthenticatedRequest, createAuthErrorResponse } from '@/lib/auth-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  logger.log('[SESSION CHECK] Secured session check request');
  try {
    const jwtPayload = request.user;
    if (!jwtPayload) {
      return createAuthErrorResponse('Not authenticated.', 'NOT_AUTHENTICATED', 401);
    }

    // 1. Strict Nonce Verification (Consistency Check)
    const storedNonce = request.cookies.get('nonce')?.value;
    if (!storedNonce || jwtPayload.nonce !== storedNonce) {
      logger.warn(`[SESSION CHECK] Nonce mismatch or missing! Payload: ${jwtPayload.nonce}, Cookie: ${storedNonce}`);
      return createAuthErrorResponse('Session nonce invalid or missing. Please login again.', 'NONCE_MISMATCH', 401, undefined, true);
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        wallet: jwtPayload.sub,
        iat: jwtPayload.iat,
        exp: jwtPayload.exp,
      }
    });

    // 2. CSRF Synchronization & Response Standardization
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, jwtPayload.sub, requestHost);
  } catch (error) {
    logger.error('[SESSION CHECK] Unexpected error:', error as Error);
    return createAuthErrorResponse('Session check failed.', 'INTERNAL_ERROR', 500);
  }
});
