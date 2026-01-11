import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { JWTManager, type JWTPayload } from './jwt-utils'; // Ensure type is imported if not already
import { getClientIp } from '@/lib/request-utils'; // Helper function to extract IP from request
import { cookies, headers } from 'next/headers';
import { securityIntegration } from './securityIntegration';
import { auditLogger } from './audit-logger';
import { logger } from 'utils/logger';

export async function verifySessionOrReject(request: Request): Promise<{ user: { publicKey: string } }> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('accessToken')?.value;

  if (!accessToken) {
    throw new Error('Missing access token');
  }

  // Read fingerprint information
  const ip = getClientIp(request); // Ensure this function exists in lib/request-utils.ts
  const userAgent = (await headers()).get('user-agent') || 'unknown';

  const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
  if (!payload || !payload.sub) {
    throw new Error('Invalid or expired access token');
  }

  // === Advanced Session Validation ===
  const secureSessionId = cookieStore.get('secure_session')?.value;
  if (secureSessionId) {
    const sessionValidation = await securityIntegration.validateSession(secureSessionId, request);
    if (!sessionValidation.valid) {
      logger.warn(`[AuthMiddleware] Stateful session validation failed: ${sessionValidation.error}`);
      throw new Error('Your session has been expired or revoked for security reasons. Please login again.');
    }
  }

  return { user: { publicKey: payload.sub } };
}

export interface AuthenticatedRequest extends NextRequest {
  user: JWTPayload;
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
  details?: string,
  clearCookies: boolean = false
) {
  const response = NextResponse.json({
    authenticated: false,
    error: message,
    code,
    details
  }, { status });

  if (clearCookies) {
    // List of security keys that must be cleared on critical failure
    const securityCookies = ['accessToken', 'refreshToken', 'nonce', 'csrfToken', 'secure_session', 'session_seed'];
    securityCookies.forEach(name => {
      response.cookies.delete(name);
    });
  }

  return response;
}

export function withAuth(handler: (req: AuthenticatedRequest, ...args: any[]) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: any[]): Promise<NextResponse> => {
    try {
      // 0. Cloudflare WAF Verification
      const { verifyCloudflareRequest } = await import('@/lib/request-utils');
      if (!verifyCloudflareRequest(request)) {
        logger.error('[AuthMiddleware] Request bypassed Cloudflare or missing edge headers.');
        return createAuthErrorResponse('Direct access prohibited. Please use the official domain.', 'WAF_BYPASS_ATTEMPT', 403);
      }

      const { accessToken, refreshToken, userAgent, ip } = extractAuthRequestMetadata(request);

      logger.log('[AuthMiddleware withAuth] Attempting to get accessToken from cookies. Found:', accessToken ? 'Yes' : 'No');

      // 1. Rate Limiting check before heavy operations
      const { AdvancedRateLimiter } = await import('./advancedRateLimiter');
      const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(
        request,
        ip, // Use IP as primary identifier for rate limiting before token verification
        request.nextUrl.pathname,
        securityIntegration.extractDeviceInfo(request)
      );

      if (!rateLimitResult.allowed) {
        logger.warn(`[AuthMiddleware] Rate limit exceeded for IP ${ip} on path ${request.nextUrl.pathname}`);
        await auditLogger.logRateLimitHit(ip, request.nextUrl.pathname, { userAgent, ip });
        return createAuthErrorResponse('Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED', 429);
      }

      if (!accessToken && !refreshToken) {
        logger.warn('[AuthMiddleware withAuth] No tokens found in cookies.');
        return createAuthErrorResponse('Authentication required.', 'NO_TOKENS', 401);
      }

      let payload = accessToken ? await JWTManager.verifyAccessToken(accessToken, userAgent, ip) : null;
      logger.log('[AuthMiddleware withAuth] Initial access token verification payload:', payload);


      if (!payload) {
        logger.log('[AuthMiddleware withAuth] Access token invalid or expired. Attempting to refresh. Refresh token found:', refreshToken ? 'Yes' : 'No');

        if (refreshToken) {
          const refreshResult = await JWTManager.refreshAccessToken(refreshToken, userAgent, ip);
          logger.log('[AuthMiddleware withAuth] Refresh token result:', refreshResult);

          if (refreshResult) {
            payload = await JWTManager.verifyAccessToken(refreshResult.accessToken, userAgent, ip);
            logger.log('[AuthMiddleware withAuth] Verification payload of newly refreshed access token:', payload);
            if (!payload) {
              logger.error("[AuthMiddleware withAuth] Failed to verify newly refreshed access token. This is unexpected.");
              return createAuthErrorResponse('Session refresh succeeded, but new token verification failed. Please login again.', 'REFRESH_VERIFY_FAILED', 401);
            }

            (request as AuthenticatedRequest).user = payload;
            const response = await handler(request as AuthenticatedRequest);

            // 1. Issue/update CSRF token on refresh
            const { CSRFManager } = await import('@/lib/csrf-utils');
            const csrfToken = await CSRFManager.getOrCreateToken(payload.sub);

            const requestHost = request.headers.get('host') || undefined; // Extract host
            logger.log('[AuthMiddleware withAuth] Setting new tokens in cookies after refresh. Request Host:', requestHost);
            response.cookies.set('accessToken', refreshResult.accessToken,
              JWTManager.createSecureCookieOptions(15 * 60, requestHost) // Max age in seconds, pass requestHost
            );
            response.cookies.set('refreshToken', refreshResult.newRefreshToken,
              JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost) // Max age in seconds, pass requestHost
            );
            response.cookies.set('csrfToken', csrfToken, {
              httpOnly: false,
              secure: JWTManager.createSecureCookieOptions(0, requestHost).secure,
              sameSite: JWTManager.createSecureCookieOptions(0, requestHost).sameSite,
              maxAge: 30 * 60,
              path: '/',
            });
            
            // 2. Refresh Nonce cookie to match session lifetime
            const existingNonce = request.cookies.get('nonce')?.value;
            if (existingNonce) {
               response.cookies.set('nonce', existingNonce, 
                 JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost)
               );
            }

            return response;
          } else {
            logger.warn('[AuthMiddleware withAuth] Refresh token attempt failed.');
          }
        } else {
          logger.warn('[AuthMiddleware withAuth] No refresh token found to attempt refresh.');
        }
        return createAuthErrorResponse('Invalid or expired access token, and refresh failed or not possible.', 'INVALID_OR_EXPIRED_TOKEN', 401, undefined, true);
      }

      // === Advanced Session Validation for withAuth ===
      const secureSessionId = request.cookies.get('secure_session')?.value;
      const host = request.headers.get('host') || '';
      const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
      const isDev = process.env.NODE_ENV === 'development';

      if (secureSessionId) {
        const sessionValidation = await securityIntegration.validateSession(secureSessionId, request);
        if (!sessionValidation.valid) {
          logger.log(`[AuthMiddleware withAuth] Stateful session validation failed: ${sessionValidation.error}`);
          await auditLogger.logSessionViolation(
            payload.sub,
            secureSessionId,
            sessionValidation.error || 'Unknown reason',
            { userAgent, ip }
          );
          return createAuthErrorResponse('Session revoked or suspicious. Please login again.', 'SESSION_STATE_INVALID', 401, undefined, true);
        }

        // === Session Binding 2.0: Rotating Seed Verification ===
        // ✅ FIX: Bypass seed rotation for high-frequency game endpoints to prevent race conditions
        const isHighFrequencyEndpoint = ['/api/game/addCoin', '/api/graphql'].some(path => request.nextUrl.pathname.startsWith(path));

        if (!isHighFrequencyEndpoint) {
          const providedSeed = request.cookies.get('session_seed')?.value;
          if (providedSeed) {
            const seedResult = await securityIntegration.validateAndRotateSeed(secureSessionId, providedSeed);
            if (!seedResult.valid) {
              if (isDev || isLocalhost) {
                logger.warn(`[AuthMiddleware] ⚠️ Seed validation fail bypassed in development for session ${secureSessionId}`);
              } else {
                logger.warn(`[AuthMiddleware] Invalid session seed for session ${secureSessionId}`);
                // ✅ FIX: Don't clear cookies on seed mismatch - allow client to resync
                return createAuthErrorResponse('Invalid session security seed. Please retry.', 'INVALID_SESSION_SEED', 401, undefined, false);
              }
            }

            // The new seed will be set in the response later
            (request as any)._nextSeed = seedResult.nextSeed;
          } else {
            if (isDev || isLocalhost) {
              logger.warn(`[AuthMiddleware] ⚠️ Missing session seed bypassed in development for session ${secureSessionId}`);
            } else {
              logger.warn(`[AuthMiddleware] Missing session seed for secure session ${secureSessionId}`);
              // ✅ FIX: Don't clear cookies on missing seed - allow client to get new seed
              return createAuthErrorResponse('Missing security sequence seed.', 'MISSING_SESSION_SEED', 401, undefined, false);
            }
          }
        }
      }

      (request as AuthenticatedRequest).user = payload;
      const response = await handler(request as AuthenticatedRequest, ...args);

      // Set the new seed in cookies if it was rotated
      if ((request as any)._nextSeed) {
        const requestHost = request.headers.get('host') || undefined;
        response.cookies.set('session_seed', (request as any)._nextSeed,
          JWTManager.createSecureCookieOptions(30 * 60, requestHost)
        );
      }

      return response;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('[AuthMiddleware withAuth] Error in middleware:', errorMessage, errorStack);
      return createAuthErrorResponse('Authentication processing error.', 'AUTH_MIDDLEWARE_ERROR', 500);
    }
  };
}

export async function extractUserFromToken(request: NextRequest): Promise<JWTPayload | null> {
  logger.log('[extractUserFromToken] Attempting to extract user from token.');
  try {

    const { accessToken, userAgent, ip } = extractAuthRequestMetadata(request);

    logger.log('[extractUserFromToken] AccessToken from cookies:', accessToken ? 'Found' : 'Not Found');
    if (!accessToken) return null;

    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);
    logger.log('[extractUserFromToken] Verified payload:', payload);
    return payload;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    logger.error('[extractUserFromToken] Error during extraction:', errorMessage);
    return null;
  }
}

export async function validateTokenFromRequest(request: Request): Promise<JWTPayload | null> {
  logger.log('[validateTokenFromRequest] Starting token validation from request.');
  try {
    const { userAgent, ip, cookieHeader } = extractAuthRequestMetadata(request);

    logger.log('[validateTokenFromRequest] Cookie header:', cookieHeader ? `"${cookieHeader.substring(0, 100)}..."` : 'Not found');

    if (!cookieHeader) {
      logger.warn('[validateTokenFromRequest] No cookie header found in the request.');
      return null;
    }

    const accessToken = JWTManager.extractTokenFromCookies(cookieHeader, 'accessToken');
    logger.log('[validateTokenFromRequest] Extracted accessToken from cookie header:', accessToken ? `"${accessToken.substring(0, 20)}..."` : 'Not found');

    if (!accessToken) {
      logger.warn('[validateTokenFromRequest] Access token not found in extracted cookies.');
      return null;
    }

    logger.log('[validateTokenFromRequest] Attempting to verify accessToken:', accessToken.substring(0, 20) + "...");
    const payload = await JWTManager.verifyAccessToken(accessToken, userAgent, ip);

    if (payload) {
      logger.log('[validateTokenFromRequest] Access token verification successful. Payload sub:', payload.sub);
    } else {
      logger.warn('[validateTokenFromRequest] Access token verification failed (returned null). Token was:', accessToken.substring(0, 20) + "...");
    }
    return payload;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('[validateTokenFromRequest] Exception during token validation:', errorMessage, errorStack);
    return null;
  }
}
