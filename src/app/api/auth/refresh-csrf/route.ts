import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { JWTManager } from '@/lib/jwt-utils';
import { getClientIp } from '@/lib/request-utils';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export async function POST(request: NextRequest) {
  logger.log('[Refresh CSRF Endpoint] Received request to refresh CSRF token.');

  try {
    // 1. Extract and verify Access Token
    const accessToken = request.cookies.get('accessToken')?.value;
    if (!accessToken) {
      logger.warn('[Refresh CSRF Endpoint] No access token found. Cannot refresh CSRF token.');
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = getClientIp(request);

    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    if (!payload || !payload.sub) {
      logger.warn('[Refresh CSRF Endpoint] Invalid or expired access token.');
      return NextResponse.json({ error: 'Invalid or expired access token.' }, { status: 401 });
    }

    const sessionId = payload.sub; // publicKey

    // 3. Set up response with new unified cookie
    const response = NextResponse.json({ success: true, message: 'CSRF token refreshed.' });
    const requestHost = request.headers.get('host') || undefined;

    return await setCsrfTokenResponse(response, sessionId, requestHost);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    logger.error('[Refresh CSRF Endpoint] Error refreshing CSRF token:', error instanceof Error ? error : undefined, errorMessage, errorStack);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
