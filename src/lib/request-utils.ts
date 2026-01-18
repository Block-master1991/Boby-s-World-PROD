import { logger } from 'utils/logger';

export function getClientIp(request: Request): string {
  const {headers} = request;

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim() !== '') return cfConnectingIp.trim();

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor && xForwardedFor.trim() !== '') {
    const [firstIp] = xForwardedFor.split(',');
    if (firstIp) return firstIp.trim();
  }

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim() !== '') return xRealIp.trim();

  return 'unknown';
}

/**
 * Verify that the request is coming from Cloudflare correctly
 */
export function verifyCloudflareRequest(request: Request): boolean {
  // For local environment or if specifically requested via env, bypass the check
  if (process.env['NODE_ENV'] === 'development' || process.env['SKIP_WAF_CHECK'] === 'true') {
    return true;
  }

  const {headers} = request;

  // Bypass for Vercel preview/production deployments if Cloudflare headers are missing
  // Vercel usually sets 'x-vercel-id' or 'vercel-deployment-url'
  if (process.env['VERCEL'] === '1' || headers.get('x-vercel-id')) {
    return true;
  }

  // Also bypass for localhost requests even in production mode
  const host = headers.get('host') || '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1')) {
    return true;
  }

  const cfConnectingIp = headers.get('cf-connecting-ip');
  const cfRay = headers.get('cf-ray');

  // In production, any request passing through Cloudflare must contain these headers
  const isCf = !!(cfConnectingIp && cfRay);
  
  if (!isCf) {
    // Log why it failed for easier debugging in Vercel/Cloudflare logs
    logger.warn(`[WAF] Request blocked: Missing Cloudflare headers. Host: ${host}`);
  }

  return isCf;
}
