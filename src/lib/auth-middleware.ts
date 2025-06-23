
import { NextRequest, NextResponse } from 'next/server';
import { JWTManager, type JWTPayload } from './jwt-utils'; // Ensure type is imported if not already

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload;
}

export function withAuth(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      const accessToken = request.cookies.get('accessToken')?.value;
      console.log('[AuthMiddleware withAuth] Attempting to get accessToken from cookies. Found:', accessToken ? 'Yes' : 'No');

      if (!accessToken) {
        console.warn('[AuthMiddleware withAuth] Access token required, none found in cookies.');
        return NextResponse.json({ 
          error: 'Access token required',
          code: 'NO_ACCESS_TOKEN'
        }, { status: 401 });
      }

      let payload = await JWTManager.verifyAccessToken(accessToken); 
      console.log('[AuthMiddleware withAuth] Initial access token verification payload:', payload);


      if (!payload) {
        const refreshTokenValue = request.cookies.get('refreshToken')?.value; 
        console.log('[AuthMiddleware withAuth] Access token invalid or expired. Attempting to refresh. Refresh token found:', refreshTokenValue ? 'Yes' : 'No');
        
        if (refreshTokenValue) {
          const refreshResult = await JWTManager.refreshAccessToken(refreshTokenValue); 
          console.log('[AuthMiddleware withAuth] Refresh token result:', refreshResult);
          
          if (refreshResult) {
            payload = await JWTManager.verifyAccessToken(refreshResult.accessToken);
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
    const accessToken = request.cookies.get('accessToken')?.value;
    console.log('[extractUserFromToken] AccessToken from cookies:', accessToken ? 'Found' : 'Not Found');
    if (!accessToken) return null;

    const payload = await JWTManager.verifyAccessToken(accessToken);
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
    const cookieHeader = request.headers.get('cookie');
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
    const payload = await JWTManager.verifyAccessToken(accessToken);
    
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

export function createAuthErrorResponse(message: string, code: string, status: number = 401): NextResponse {
  console.warn(`[AuthErrorResponse] Creating error response: Status ${status}, Code ${code}, Message: ${message}`);
  return NextResponse.json({
    error: message,
    code,
    timestamp: new Date().toISOString()
  }, { status });
}
