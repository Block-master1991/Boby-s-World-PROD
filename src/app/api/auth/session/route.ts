import { NextResponse } from 'next/server';
import { validateTokenFromRequest, createAuthErrorResponse } from '@/lib/auth-middleware';

export async function GET(request: Request) {
  console.log('[SESSION CHECK] Received session check request');
  try {
    const jwtPayload = await validateTokenFromRequest(request);
    if (!jwtPayload) {
      console.warn('[SESSION CHECK] No valid JWT. Returning 401.');
      return createAuthErrorResponse(
        'No valid app JWT token.',
        'APP_JWT_INVALID_FOR_SESSION_CHECK',
        401
      );
    }
    return NextResponse.json({
      authenticated: true,
      user: {
        wallet: jwtPayload.sub,
        iat: jwtPayload.iat,
        exp: jwtPayload.exp,
      }
    });
  } catch (error: any) {
    console.error('[SESSION CHECK] Unexpected error in session verification:', error);
    return createAuthErrorResponse(
      'Session verification failed.',
      'SESSION_VERIFICATION_FAILED_INTERNAL',
      403, // نستخدم 403 هنا للتمييز بين الخطأ الداخلي أو تزوير محتمل
      process.env.NODE_ENV === 'development' ? error.message : undefined
    );
  }
}