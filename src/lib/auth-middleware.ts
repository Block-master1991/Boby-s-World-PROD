
import { NextRequest, NextResponse } from 'next/server';
import { JWTManager, type JWTPayload } from './jwt-utils'; // Ensure type is imported if not already
import { getClientIp } from '@/lib/request-utils'; // دالة مساعدة لاستخراج IP من request
import { cookies, headers } from 'next/headers';

export async function verifySessionOrReject(request: Request): Promise<{ user: { publicKey: string } }> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;

  if (!accessToken) {
    throw new Error('Missing access token');
  }

  // قراءة معلومات البصمة (fingerprint)
  const ip = getClientIp(request); // تأكد أن هذه الدالة موجودة في lib/request-utils.ts
const userAgent = (await headers()).get('user-agent') || 'unknown';

  const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
  if (!payload || !payload.sub) {
    throw new Error('Invalid or expired access token');
  }

  return { user: { publicKey: payload.sub } };
}

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

function extractAuthRequestMetadata(request: NextRequest | Request): {
  accessToken: string | null;
  refreshToken: string | null;
  userAgent: string;
  ip: string;
  cookieHeader?: string | null;
} {
  const isEdge = typeof (request as NextRequest).cookies?.get === 'function';

  const cookieHeader = 'headers' in request ? request.headers.get('cookie') : undefined;

  const accessToken = isEdge
  ? (request as NextRequest).cookies.get('accessToken')?.value ?? null
  : cookieHeader
    ? JWTManager.extractTokenFromCookies(cookieHeader, 'accessToken')
    : null;

const refreshToken = isEdge
  ? (request as NextRequest).cookies.get('refreshToken')?.value ?? null
  : cookieHeader
    ? JWTManager.extractTokenFromCookies(cookieHeader, 'refreshToken')
    : null;

  const userAgent = request.headers.get('user-agent') || 'unknown';
  const ip = getClientIp(request);

  return { accessToken, refreshToken, userAgent, ip, cookieHeader };
}

export function createAuthErrorResponse(
  message: string,
  code: string,
  status: number = 401,
  details?: string
) {
  return NextResponse.json({
    authenticated: false,
    error: message,
    code,
    details
  }, { status });
}

export function withAuth(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
            
      const { accessToken, refreshToken, userAgent, ip } = extractAuthRequestMetadata(request);

      console.log('[AuthMiddleware withAuth] Attempting to get accessToken from cookies. Found:', accessToken ? 'Yes' : 'No');

      if (!accessToken) {
        console.warn('[AuthMiddleware withAuth] Access token required, none found in cookies.');
        return NextResponse.json({ 
          error: 'Access token required',
          code: 'NO_ACCESS_TOKEN'
        }, { status: 401 });
      }
      
      let payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip); 
      console.log('[AuthMiddleware withAuth] Initial access token verification payload:', payload);


      if (!payload) {
        console.log('[AuthMiddleware withAuth] Access token invalid or expired. Attempting to refresh. Refresh token found:', refreshToken ? 'Yes' : 'No');

        if (refreshToken) {
          const refreshResult = await JWTManager.refreshAccessToken(refreshToken, userAgent, ip);
          console.log('[AuthMiddleware withAuth] Refresh token result:', refreshResult);
          
          if (refreshResult) {
            payload = await JWTManager.verifyAccessToken(refreshResult.accessToken, userAgent, ip);
            console.log('[AuthMiddleware withAuth] Verification payload of newly refreshed access token:', payload);
            if (!payload) {
                console.error("[AuthMiddleware withAuth] Failed to verify newly refreshed access token. This is unexpected.");
                return createAuthErrorResponse('Session refresh succeeded, but new token verification failed. Please login again.', 'REFRESH_VERIFY_FAILED', 401);
            }

            (request as AuthenticatedRequest).user = payload;
            const response = await handler(request as AuthenticatedRequest);
            
            console.log('[AuthMiddleware withAuth] Setting new tokens in cookies after refresh.');
            response.cookies.set('accessToken', refreshResult.accessToken, 
              JWTManager.createSecureCookieOptions(15 * 60) // Max age in seconds
            );
            response.cookies.set('refreshToken', refreshResult.newRefreshToken, 
              JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60) // Max age in seconds
            );
            return response;
          } else {
            console.warn('[AuthMiddleware withAuth] Refresh token attempt failed.');
          }
        } else {
            console.warn('[AuthMiddleware withAuth] No refresh token found to attempt refresh.');
        }
        return createAuthErrorResponse('Invalid or expired access token, and refresh failed or not possible.', 'INVALID_OR_EXPIRED_TOKEN', 401);
      }

      (request as AuthenticatedRequest).user = payload;
      return handler(request as AuthenticatedRequest);

    } catch (error: any) {
      console.error('[AuthMiddleware withAuth] Error in middleware:', error.message, error.stack);
      return createAuthErrorResponse('Authentication processing error.', 'AUTH_MIDDLEWARE_ERROR', 500);
    }
  };
}

export async function extractUserFromToken(request: NextRequest): Promise<JWTPayload | null> { 
  console.log('[extractUserFromToken] Attempting to extract user from token.');
  try {
        
    const { accessToken, userAgent, ip } = extractAuthRequestMetadata(request);

    console.log('[extractUserFromToken] AccessToken from cookies:', accessToken ? 'Found' : 'Not Found');
    if (!accessToken) return null;

    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    console.log('[extractUserFromToken] Verified payload:', payload);
    return payload;
  } catch (error: any) {
    console.error('[extractUserFromToken] Error during extraction:', error.message);
    return null;
  }
}

export async function validateTokenFromRequest(request: Request): Promise<JWTPayload | null> {
  console.log('[validateTokenFromRequest] Starting token validation from request.');
  try {
        const { userAgent, ip, cookieHeader } = extractAuthRequestMetadata(request);

    console.log('[validateTokenFromRequest] Cookie header:', cookieHeader ? `"${cookieHeader.substring(0,100)}..."` : 'Not found');

    if (!cookieHeader) {
      console.warn('[validateTokenFromRequest] No cookie header found in the request.');
      return null;
    }

    const accessToken = JWTManager.extractTokenFromCookies(cookieHeader, 'accessToken');
    console.log('[validateTokenFromRequest] Extracted accessToken from cookie header:', accessToken ? `"${accessToken.substring(0,20)}..."` : 'Not found');

    if (!accessToken) {
      console.warn('[validateTokenFromRequest] Access token not found in extracted cookies.');
      return null;
    }

    console.log('[validateTokenFromRequest] Attempting to verify accessToken:', accessToken.substring(0,20) + "...");
    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    
    if (payload) {
      console.log('[validateTokenFromRequest] Access token verification successful. Payload sub:', payload.sub);
    } else {
      console.warn('[validateTokenFromRequest] Access token verification failed (returned null). Token was:', accessToken.substring(0,20) + "...");
    }
    return payload;

  } catch (error: any) {
    console.error('[validateTokenFromRequest] Exception during token validation:', error.message, error.stack);
    return null;
  }
}



