import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { createAuthErrorResponse } from '@/lib/auth-middleware';
import { getClientIp } from '@/lib/request-utils';
export async function POST(request: Request) {
  
  console.log('[REFRESH] Received refresh token request');
  try {
    const cookieStore = await cookies();
    const refreshTokenValue = cookieStore.get('refreshToken')?.value;
    console.log('[REFRESH] Refresh token value from cookies:', refreshTokenValue ? 'Found' : 'Not found');
    const nonce = cookieStore.get('nonce')?.value; // مثال: إذا nonce مخزن في كوكيز
    

    if (!refreshTokenValue) {
      const response = createAuthErrorResponse('Refresh token not found', 'NO_REFRESH_TOKEN', 401);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    if (!nonce) {
      console.warn('[REFRESH] Missing nonce in request cookies');
      const response = createAuthErrorResponse('Missing nonce, invalid session', 'MISSING_NONCE', 401);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }
console.log('[REFRESH] Refresh token and nonce found, verifying match');
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = getClientIp(request); // استعمل دالة موجودة لديك لقراءة IP العميل

    const payload = await JWTManager.verifyRefreshToken(refreshTokenValue, userAgent, ip);
    
    if (!payload) {
      console.warn('[REFRESH] Refresh token verification failed (null payload)');
      const response = createAuthErrorResponse('Invalid refresh token.', 'INVALID_REFRESH_TOKEN', 403);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }
    if (payload.nonce !== nonce) {
      console.warn(`[REFRESH] Nonce mismatch. Token nonce: ${payload.nonce}, Cookie nonce: ${nonce}`);
      const response = createAuthErrorResponse('Invalid nonce. Session mismatch.', 'NONCE_MISMATCH', 403);
      response.cookies.delete('accessToken');
      response.cookies.delete('refreshToken');
      response.cookies.delete('nonce');
      return response;
    }

    const result = await JWTManager.refreshAccessToken(refreshTokenValue, userAgent, ip);
    console.log('[REFRESH] Refresh result:', !!result);

    if (result) {
      console.log('[REFRESH] New tokens issued');
    } else {
      console.warn('[REFRESH] Refresh token invalid or expired');
    }

    if (!result) {
      // حذف الكوكيز
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

    const secureOptions = JWTManager.createSecureCookieOptions(15 * 60); // 15 دقيقة
    response.cookies.set('accessToken', accessToken, secureOptions);

    const refreshOptions = JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60); // 7 أيام
    response.cookies.set('refreshToken', newRefreshToken, refreshOptions);

    
    return response;

  } catch (error: any) {
    console.error('Token refresh error:', error);
    // حذف التوكنات عند الخطأ
    const response = NextResponse.json({
      error: 'Token refresh failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error during token refresh.',
      code: 'REFRESH_FAILED_INTERNAL'
    }, { status: 500 });

    response.cookies.delete('accessToken');
    response.cookies.delete('refreshToken');
    response.cookies.delete('nonce');

    return response;
  }

}
