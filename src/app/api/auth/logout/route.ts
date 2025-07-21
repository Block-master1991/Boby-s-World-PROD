import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTManager } from '@/lib/jwt-utils';
import { withCsrfProtection } from '@/lib/csrf-middleware'; // استيراد CSRF middleware
import { CSRFManager } from '@/lib/csrf-utils'; // استيراد CSRFManager
import { getClientIp } from '@/lib/request-utils'; // لاستخراج IP إذا لزم الأمر للتحقق من الرمز المميز

export const POST = withCsrfProtection(async (request: Request) => {
  console.log('[LOGOUT] Received logout request');
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('accessToken')?.value;
    const refreshToken = cookieStore.get('refreshToken')?.value;

    console.log('[LOGOUT] Access token:', accessToken);
    console.log('[LOGOUT] Refresh token:', refreshToken);

    let userPublicKey: string | undefined;

    // Blacklist tokens if they exist
    if (accessToken) {
      console.log('[LOGOUT] Blacklisting accessToken');
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
        console.warn('[LOGOUT] Could not extract publicKey from accessToken for CSRF invalidation:', tokenError);
      }
    }
    if (refreshToken) {
      console.log('[LOGOUT] Blacklisting refreshToken');
      await JWTManager.revokeToken(refreshToken, 'logout');
    }

    // Invalidate CSRF token in Firestore if publicKey is available
    if (userPublicKey) {
      console.log(`[LOGOUT] Invalidating CSRF token for session ${userPublicKey} in Firestore.`);
      await CSRFManager.deleteToken(userPublicKey);
    }

    const requestHost = request.headers.get('host') || undefined;

    // خيارات الكوكيز لحذفها (تعيين maxAge إلى -1 أو expires إلى تاريخ قديم)
    // يجب أن تتطابق الخيارات (path, domain, secure, httpOnly, sameSite) مع تلك التي تم تعيين الكوكي بها في الأصل
    const commonExpiredOptions = {
      ...JWTManager.createSecureCookieOptions(-1, requestHost), // استخدم -1 لـ maxAge للحذف الفوري
      expires: new Date(0), // تأكيد الحذف بتعيين تاريخ انتهاء صلاحية في الماضي
    };

    // خيارات خاصة لـ csrfToken لأنه ليس httpOnly
    // نعود إلى الطريقة الأكثر بساطة وموثوقية لحذف الكوكيز غير httpOnly
    const csrfExpiredOptions = {
      expires: new Date(0), // تعيين تاريخ انتهاء الصلاحية إلى 1 يناير 1970 (الماضي البعيد)
      path: '/', // تأكد من أن المسار يطابق المسار الذي تم تعيين الكوكي به
    };

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully. All session cookies cleared.'
    });

    console.log('[LOGOUT] Clearing cookies');

    // حذف جميع الكوكيز المتعلقة بالمصادقة
    response.cookies.set('accessToken', '', commonExpiredOptions);
    response.cookies.set('refreshToken', '', commonExpiredOptions);
    response.cookies.set('session', '', commonExpiredOptions); 
    response.cookies.set('nonce', '', commonExpiredOptions);
    response.cookies.set('csrfToken', '', csrfExpiredOptions); 
    // أضف أي كوكيز أخرى قد تكون موجودة وتحتاج إلى مسح
    // response.cookies.set('anotherCookieName', '', commonExpiredOptions);

    console.log('[LOGOUT] Logout process completed');
    return response;

  } catch (error: any) {
    console.error('[POST /api/auth/logout] Error during logout:', error.message, error.stack);
    return NextResponse.json({
      error: 'Logout failed',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }, { status: 500 });
  }
});
