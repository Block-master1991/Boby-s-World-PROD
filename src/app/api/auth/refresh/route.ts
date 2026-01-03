import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { createAuthErrorResponse } from '@/lib/auth-middleware';
import { getClientIp } from '@/lib/request-utils';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export const POST = withCsrfProtection(async (request: Request) => {

  logger.log('[REFRESH] Received refresh token request');
  try {
    const cookieStore = await cookies();
    const refreshTokenValue = cookieStore.get('refreshToken')?.value;
    const nonce = cookieStore.get('nonce')?.value;

    if (!refreshTokenValue) {
      const response = createAuthErrorResponse('Refresh token not found', 'NO_REFRESH_TOKEN', 401);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    if (!nonce) {
      logger.warn('[REFRESH] Missing nonce in request cookies');
      const response = createAuthErrorResponse('Missing nonce, invalid session', 'MISSING_NONCE', 401);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = getClientIp(request);

    const payload = await JWTManager.verifyRefreshToken(refreshTokenValue, userAgent, ip);

    if (!payload) {
      logger.warn('[REFRESH] Refresh token verification failed (null payload)');
      const response = createAuthErrorResponse('Invalid refresh token.', 'INVALID_REFRESH_TOKEN', 403);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    if (payload.nonce !== nonce) {
      logger.warn(`[REFRESH] Nonce mismatch. Token nonce: ${payload.nonce}, Cookie nonce: ${nonce}`);
      const response = createAuthErrorResponse('Invalid nonce. Session mismatch.', 'NONCE_MISMATCH', 403);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    const result = await JWTManager.refreshAccessToken(refreshTokenValue, userAgent, ip);
    if (!result) {
      const response = createAuthErrorResponse('Invalid or expired refresh token. Please login again.', 'INVALID_REFRESH_TOKEN', 401);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    const { accessToken, newRefreshToken } = result;

    const response = NextResponse.json({
      success: true,
      message: 'Tokens refreshed successfully'
    });

    const requestHost = request.headers.get('host') || undefined;
    const refreshOptions = JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost);

    response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
    response.cookies.set('refreshToken', newRefreshToken, refreshOptions);
    response.cookies.set('nonce', nonce, refreshOptions);

    return await setCsrfTokenResponse(response, payload.sub, requestHost);

  } catch (error) {
    logger.error('Token refresh error:', error instanceof Error ? (error as Error) : undefined);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const response = NextResponse.json({
      error: 'Token refresh failed',
      details: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error during token refresh.',
      code: 'REFRESH_FAILED_INTERNAL'
    }, { status: 500 });

    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');
    response.cookies.delete('nonce');

    return response;
  }
});
