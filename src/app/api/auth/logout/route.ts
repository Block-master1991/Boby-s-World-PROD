import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // Import CSRF middleware
import { securityIntegration } from '@/lib/securityIntegration'; // Import SecurityIntegration
import { CSRFManager } from '@/lib/csrf-utils'; // Import CSRFManager
import { getClientIp } from '@/lib/request-utils'; // To extract IP if needed for token verification
import { auditLogger } from '@/lib/audit-logger';

export const POST = withCsrfProtection(async (request: Request) => {
  logger.log('[LOGOUT] Received logout request');
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;
    const refreshToken = cookieStore.get('refreshToken')?.value;

    logger.log('[LOGOUT] Access token:', accessToken);
    logger.log('[LOGOUT] Refresh token:', refreshToken);

    let userPublicKey: string | undefined;

    // Blacklist tokens if they exist
    if (accessToken) {
      logger.log('[LOGOUT] Blacklisting accessToken');
      await JWTManager.revokeToken(accessToken, 'logout');
      // Try to get publicKey from accessToken to invalidate CSRF token
      try {
        const userAgent = request.headers.get('user-agent') || 'unknown';
        const ip = getClientIp(request);
        const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
        if (payload && payload.sub) {
          userPublicKey = payload.sub;
        }
      } catch (tokenError) {
        logger.warn('[LOGOUT] Could not extract publicKey from accessToken for CSRF invalidation:', tokenError);
      }
    }
    if (refreshToken) {
      logger.log('[LOGOUT] Blacklisting refreshToken');
      await JWTManager.revokeToken(refreshToken, 'logout');
    }

    // Invalidate CSRF token in Firestore if publicKey is available
    if (userPublicKey) {
      logger.log(`[LOGOUT] Invalidating CSRF token for session ${userPublicKey} in Firestore.`);
      await CSRFManager.deleteToken(userPublicKey);

      // Revoke all active sessions via SecurityIntegration (Unified)
      logger.log(`[LOGOUT] Revoking all advanced sessions for user ${userPublicKey}`);
      await securityIntegration.terminateAllUserSessions(userPublicKey);

      // Log security event (SIEM)
      await auditLogger.logEvent(
        'LOGOUT',
        `User logged out successfully: ${userPublicKey}`,
        {
          userId: userPublicKey,
          ip: getClientIp(request),
          endpoint: '/api/auth/logout'
        },
        'info'
      );
    }

    const requestHost = request.headers.get('host') || undefined;

    // Cookie options for deletion
    const commonExpiredOptions = {
      ...JWTManager.createSecureCookieOptions(-1, requestHost),
      expires: new Date(0),
    };

    const csrfExpiredOptions = {
      expires: new Date(0),
      path: '/',
    };

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully. All session cookies cleared.'
    });

    logger.log('[LOGOUT] Clearing cookies');

    // Delete all authentication-related cookies
    response.cookies.set('accessToken', '', commonExpiredOptions);
    response.cookies.set('refreshToken', '', commonExpiredOptions);
    response.cookies.set('session', '', commonExpiredOptions);
    response.cookies.set('nonce', '', commonExpiredOptions);
    response.cookies.set('csrfToken', '', csrfExpiredOptions);
    response.cookies.set('secure_session', '', commonExpiredOptions);
    response.cookies.set('session_seed', '', commonExpiredOptions); // Also clear session seed
    // response.cookies.set('anotherCookieName', '', commonExpiredOptions);

    logger.log('[LOGOUT] Logout process completed');
    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error('[POST /api/auth/logout] Error during logout:', new Error(errorMessage));
    return NextResponse.json({
      error: 'Logout failed',
      details: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error'
    }, { status: 500 });
  }
});
