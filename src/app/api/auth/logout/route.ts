import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';

export async function POST(request: Request) {
  console.log('[LOGOUT] Received logout request');
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;
    const refreshToken = cookieStore.get('refreshToken')?.value;

    console.log('[LOGOUT] Access token:', accessToken);
    console.log('[LOGOUT] Refresh token:', refreshToken);

    // Blacklist tokens if they exist
    if (accessToken) {
      console.log('[LOGOUT] Blacklisting accessToken');
      await JWTManager.revokeToken(accessToken, 'logout');
    }
    if (refreshToken) {
      console.log('[LOGOUT] Blacklisting refreshToken');
      await JWTManager.revokeToken(refreshToken, 'logout');
    }

    // إعداد خيارات حذف الكوكيز
    const expiredCookieOptions = {
      ...JWTManager.createSecureCookieOptions(0),
      maxAge: -1,
    };

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully. All session cookies cleared.'
    });

    console.log('[LOGOUT] Clearing cookies');

    // حذف جميع الكوكيز المتعلقة بالمصادقة
    response.cookies.set('accessToken', '', expiredCookieOptions);
    response.cookies.set('refreshToken', '', expiredCookieOptions);
    response.cookies.set('session', '', expiredCookieOptions); // إذا كنت تستخدم كوكيز أخرى للجلسة

    console.log('[LOGOUT] Logout process completed');
    return response;

  } catch (error: any) {
    console.error('[POST /api/auth/logout] Error during logout:', error.message, error.stack);
    return NextResponse.json({
      error: 'Logout failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }, { status: 500 });
  }
}

