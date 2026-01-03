import { NextResponse, type NextRequest } from 'next/server';
import { CSRFManager } from './csrf-utils';
import { JWTManager } from './jwt-utils'; // To decrypt Access Token and get publicKey
import { getClientIp } from '@/lib/request-utils'; // To extract IP if needed for token verification
import { auditLogger } from './audit-logger';
import { logger } from '@/utils/logger';

export function withCsrfProtection(handler: (req: any, ...args: any[]) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    logger.log('[CSRFMiddleware] Starting CSRF protection check.');

    // Allow logout requests to bypass CSRF protection
    if (request.nextUrl?.pathname === '/api/auth/logout') {
      logger.log('[CSRFMiddleware] Bypassing CSRF check for logout request.');
      return handler(request, ...args);
    }

    try {
      // 1. Extract Access Token to get sessionId (publicKey)
      const accessToken = request.cookies.get('accessToken')?.value;
      if (!accessToken) {
        // CSRF protection is only necessary for authenticated requests.
        // If there's no access token, there's no session to hijack via CSRF.
        // The individual handlers will still enforce authentication if needed.
        logger.log('[CSRFMiddleware] No access token found. Skipping CSRF check for unauthenticated request.');
        return handler(request, ...args);
      }

      const userAgent = request.headers.get('user-agent') || 'unknown';
      const ip = getClientIp(request);

      const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
      if (!payload || !payload.sub) {
        logger.warn('[CSRFMiddleware] Invalid or expired access token for CSRF check. Denying request.');
        return NextResponse.json({ error: 'Invalid or expired access token for CSRF validation.' }, { status: 401 });
      }

      const sessionId = payload.sub; // User's publicKey as sessionId

      // 2. Extract CSRF Token from request header
      const clientCsrfToken = request.headers.get('x-csrf-token');
      if (!clientCsrfToken) {
        logger.warn(`[CSRFMiddleware] No X-CSRF-Token header found for session ${sessionId}. Denying request.`);
        return NextResponse.json({ error: 'CSRF token header missing.' }, { status: 403 });
      }

      // 3. Verify CSRF Token
      const isCsrfTokenValid = await CSRFManager.verifyToken(sessionId, clientCsrfToken);

      if (!isCsrfTokenValid) {
        logger.warn(`[CSRFMiddleware] Invalid or expired CSRF token for session ${sessionId}. Denying request.`);

        await auditLogger.logCsrfViolation({
          sessionId,
          ipAddress: ip,
          userAgent,
          endpoint: request.nextUrl.pathname,
          deviceFingerprint: 'unknown' // Middleware context might not have fingerprint readily available unless parsed
        });

        return NextResponse.json({ error: 'Invalid or expired CSRF token.' }, { status: 403 });
      }

      logger.log(`[CSRFMiddleware] CSRF token valid for session ${sessionId}. Proceeding with handler.`);
      return handler(request, ...args);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('[CSRFMiddleware] Error during CSRF protection:', errorMessage, errorStack);
      return NextResponse.json({ error: 'Internal server error during CSRF validation.' }, { status: 500 });
    }
  };
}
