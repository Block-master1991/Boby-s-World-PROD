import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { createAuthErrorResponse } from '@/lib/auth-middleware';

export async function POST(request: Request) {
  
  console.log('[REFRESH] Received refresh token request');
  try {
    const cookieStore = await cookies();
    const refreshTokenValue = cookieStore.get('refreshToken')?.value;

    if (!refreshTokenValue) {
      return createAuthErrorResponse('Refresh token not found', 'NO_REFRESH_TOKEN', 401);
    }

    console.log('[REFRESH] Refresh token value:', refreshTokenValue);

    const result = await JWTManager.refreshAccessToken(refreshTokenValue);
    console.log('[REFRESH] Refresh result:', !!result);

    if (result) {
      console.log('[REFRESH] New tokens issued');
    } else {
      console.warn('[REFRESH] Refresh token invalid or expired');
    }

    if (!result) {
      await JWTManager.revokeToken(refreshTokenValue, 'expired');
      return createAuthErrorResponse('Invalid or expired refresh token. Please login again.', 'INVALID_REFRESH_TOKEN', 401);
    }

    const { accessToken, newRefreshToken } = result;

    const response = NextResponse.json({
      success: true,
      message: 'Tokens refreshed successfully'
    });

    response.cookies.set('accessToken', accessToken,
      JWTManager.createSecureCookieOptions(15 * 60) // 15 دقيقة
    );
    response.cookies.set('refreshToken', newRefreshToken,
      JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60) // 7 أيام
    );

    return response;

  } catch (error: any) {
    console.error('Token refresh error:', error);
    const details = process.env.NODE_ENV === 'development' ? error.message : 'Internal server error during token refresh.';
    return NextResponse.json({
      error: 'Token refresh failed',
      details: details,
      code: 'REFRESH_FAILED_INTERNAL'
    }, { status: 500 });
  }
}
