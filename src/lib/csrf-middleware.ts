import { NextRequest, NextResponse } from 'next/server';
import { CSRFManager } from './csrf-utils';
import { JWTManager } from './jwt-utils'; // لفك تشفير Access Token للحصول على publicKey
import { getClientIp } from '@/lib/request-utils'; // لاستخراج IP إذا لزم الأمر للتحقق من الرمز المميز

export function withCsrfProtection(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    console.log('[CSRFMiddleware] Starting CSRF protection check.');

    // Allow logout requests to bypass CSRF protection
    if (request.nextUrl.pathname === '/api/auth/logout') {
      console.log('[CSRFMiddleware] Bypassing CSRF check for logout request.');
      return handler(request);
    }

    try {
      // 1. استخراج Access Token للحصول على sessionId (publicKey)
      const accessToken = request.cookies.get('accessToken')?.value;
      if (!accessToken) {
        console.warn('[CSRFMiddleware] No access token found for CSRF check. Denying request.');
        return NextResponse.json({ error: 'Access token required for CSRF validation.' }, { status: 401 });
      }

      const userAgent = request.headers.get('user-agent') || 'unknown';
      const ip = getClientIp(request);

      const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
      if (!payload || !payload.sub) {
        console.warn('[CSRFMiddleware] Invalid or expired access token for CSRF check. Denying request.');
        return NextResponse.json({ error: 'Invalid or expired access token for CSRF validation.' }, { status: 401 });
      }

      const sessionId = payload.sub; // publicKey المستخدم كـ sessionId

      // 2. استخراج CSRF Token من رأس الطلب
      const clientCsrfToken = request.headers.get('x-csrf-token');
      if (!clientCsrfToken) {
        console.warn(`[CSRFMiddleware] No X-CSRF-Token header found for session ${sessionId}. Denying request.`);
        return NextResponse.json({ error: 'CSRF token header missing.' }, { status: 403 });
      }

      // 3. التحقق من CSRF Token
      const isCsrfTokenValid = await CSRFManager.verifyToken(sessionId, clientCsrfToken);

      if (!isCsrfTokenValid) {
        console.warn(`[CSRFMiddleware] Invalid or expired CSRF token for session ${sessionId}. Denying request.`);
        return NextResponse.json({ error: 'Invalid or expired CSRF token.' }, { status: 403 });
      }

      console.log(`[CSRFMiddleware] CSRF token valid for session ${sessionId}. Proceeding with handler.`);
      return handler(request);

    } catch (error: any) {
      console.error('[CSRFMiddleware] Error during CSRF protection:', error.message, error.stack);
      return NextResponse.json({ error: 'Internal server error during CSRF validation.' }, { status: 500 });
    }
  };
}
