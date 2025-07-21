import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { createAuthErrorResponse } from '@/lib/auth-middleware';
import { getClientIp } from '@/lib/request-utils';
import { CSRFManager } from '@/lib/csrf-utils';

export async function GET(request: Request) {
  console.log('[SESSION CHECK] Received session check request');
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;
    const refreshToken = cookieStore.get('refreshToken')?.value;
    const nonce = cookieStore.get('nonce')?.value; // Assuming nonce is also in cookies

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = getClientIp(request);
    const requestHost = request.headers.get('host') || undefined;

    let jwtPayload = null;
    let shouldRefresh = false;

    if (accessToken) {
      jwtPayload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
      if (jwtPayload) {
        console.log('[SESSION CHECK] Access token is valid.');
      } else {
        console.warn('[SESSION CHECK] Access token invalid or expired. Attempting refresh.');
        shouldRefresh = true;
      }
    } else {
      console.warn('[SESSION CHECK] No access token found.');
      shouldRefresh = true; // Try to refresh if no access token
    }

    if (shouldRefresh && refreshToken && nonce) {
      console.log('[SESSION CHECK] Attempting to refresh tokens...');
      const refreshResult = await JWTManager.refreshAccessToken(refreshToken, userAgent, ip);

      if (refreshResult) {
        const { accessToken: newAccessToken, newRefreshToken } = refreshResult;
        const newPayload = await JWTManager.verifyAccessToken(newAccessToken, userAgent, ip);
        
        if (newPayload && newPayload.nonce === nonce) { // Ensure nonce matches after refresh
          jwtPayload = newPayload;
          console.log('[SESSION CHECK] Tokens refreshed successfully. Setting new cookies.');

          const response = NextResponse.json({
            authenticated: true,
            user: {
              wallet: jwtPayload.sub,
              iat: jwtPayload.iat,
              exp: jwtPayload.exp,
            }
          });

          // Set new access and refresh tokens
          response.cookies.set('accessToken', newAccessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
          response.cookies.set('refreshToken', newRefreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));
          
          // Issue/update CSRF token
          const csrfToken = await CSRFManager.getOrCreateToken(jwtPayload.sub);
          response.cookies.set('csrfToken', csrfToken, {
            httpOnly: false,
            secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
            sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
            maxAge: 30 * 60, // 30 دقيقة
            path: '/',
          });
          console.log('[SESSION CHECK] New CSRF token issued and set in cookie after refresh.');

          return response;
        } else {
          console.warn('[SESSION CHECK] Nonce mismatch after refresh or new access token invalid. Forcing re-login.');
          // If nonce mismatch or new token invalid, force re-login by clearing cookies
          const response = createAuthErrorResponse('Session mismatch or invalid tokens after refresh. Please login again.', 'SESSION_MISMATCH_AFTER_REFRESH', 401);
          response.cookies.delete('accessToken');
          response.cookies.delete('refreshToken');
          response.cookies.delete('nonce');
          response.cookies.delete('csrfToken');
          return response;
        }
      } else {
        console.warn('[SESSION CHECK] Refresh token invalid or expired. Cannot refresh.');
        // If refresh fails, clear all auth cookies and return 401
        const response = createAuthErrorResponse('Session expired. Please login again.', 'REFRESH_FAILED', 401);
        response.cookies.delete('accessToken');
        response.cookies.delete('refreshToken');
        response.cookies.delete('nonce');
        response.cookies.delete('csrfToken');
        return response;
      }
    }

    if (jwtPayload) {
      console.log('[SESSION CHECK] Returning authenticated response with existing valid tokens.');
      return NextResponse.json({
        authenticated: true,
        user: {
          wallet: jwtPayload.sub,
          iat: jwtPayload.iat,
          exp: jwtPayload.exp,
        }
      });
    } else {
      console.warn('[SESSION CHECK] Not authenticated. No valid tokens found or refresh failed.');
      return createAuthErrorResponse(
        'Not authenticated.',
        'NOT_AUTHENTICATED',
        401
      );
    }
  } catch (error: any) {
    console.error('[SESSION CHECK] Unexpected error in session verification:', error);
    // In case of any unexpected error, clear cookies and return 500
    const response = createAuthErrorResponse(
      'Session verification failed due to server error.',
      'SESSION_VERIFICATION_FAILED_INTERNAL',
      500,
      process.env.NODE_ENV === 'development' ? error.message : undefined
    );
    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');
    response.cookies.delete('nonce');
    response.cookies.delete('csrfToken');
    return response;
  }
}
