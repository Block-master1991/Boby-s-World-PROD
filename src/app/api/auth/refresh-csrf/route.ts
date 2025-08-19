import { NextRequest, NextResponse } from 'next/server';
import { JWTManager } from '@/lib/jwt-utils';
import { CSRFManager } from '@/lib/csrf-utils';
import { getClientIp } from '@/lib/request-utils';

export async function POST(request: NextRequest) {
  console.log('[Refresh CSRF Endpoint] Received request to refresh CSRF token.');

  try {
    // 1. استخراج Access Token والتحقق منه
    const accessToken = request.cookies.get('accessToken')?.value;
    if (!accessToken) {
      console.warn('[Refresh CSRF Endpoint] No access token found. Cannot refresh CSRF token.');
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const userAgent = request.headers.get('user-agent') || 'unknown';
    const ip = getClientIp(request);

    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    if (!payload || !payload.sub) {
      console.warn('[Refresh CSRF Endpoint] Invalid or expired access token.');
      return NextResponse.json({ error: 'Invalid or expired access token.' }, { status: 401 });
    }

    const sessionId = payload.sub; // publicKey

    // 2. إنشاء أو الحصول على توكن CSRF جديد
    console.log(`[Refresh CSRF Endpoint] Generating new CSRF token for session ${sessionId}.`);
    const newCsrfToken = await CSRFManager.getOrCreateToken(sessionId);

    // 3. إعداد الاستجابة مع الـ cookie الجديد
    const response = NextResponse.json({ success: true, message: 'CSRF token refreshed.' });

    // Set the new CSRF token in a cookie
    response.cookies.set('csrfToken', newCsrfToken, {
      httpOnly: false, // Must be accessible by client-side script
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'strict',
      // Expiry is managed by the server-side logic in Firestore, so cookie expiry can be longer
      maxAge: 60 * 60 * 24, // 24 hours
    });

    console.log(`[Refresh CSRF Endpoint] Successfully refreshed CSRF token for session ${sessionId}.`);
    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[Refresh CSRF Endpoint] Error refreshing CSRF token:', errorMessage, errorStack);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
