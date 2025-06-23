import { NextResponse } from 'next/server';
import { validateTokenFromRequest, createAuthErrorResponse } from '@/lib/auth-middleware';

export async function GET(request: Request) {
  try {
    const jwtPayload = await validateTokenFromRequest(request);
    if (!jwtPayload) {
      return createAuthErrorResponse('No valid app JWT token.', 'APP_JWT_INVALID_FOR_SESSION_CHECK', 401);
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
    return NextResponse.json({
      authenticated: false,
      error: 'Session verification failed.',
      code: 'SESSION_VERIFICATION_FAILED_INTERNAL',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 401 });
  }
}