export function getClientIp(request: Request): string {
  const headers = request.headers;

  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim() !== '') return cfConnectingIp.trim();

  const xForwardedFor = headers.get('x-forwarded-for');
  if (xForwardedFor && xForwardedFor.trim() !== '') return xForwardedFor.split(',')[0].trim();

  const xRealIp = headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim() !== '') return xRealIp.trim();

  return 'unknown';
}

/**
 * Verify that the request is coming from Cloudflare correctly
 */
export function verifyCloudflareRequest(request: Request): boolean {
  // For local environment, bypass the check
  if (process.env.NODE_ENV === 'development') return true;

  const headers = request.headers;

  // Also bypass for localhost requests even in production mode (for local testing with `npm start`)
  const host = headers.get('host') || '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('::1')) {
    return true;
  }

  const cfConnectingIp = headers.get('cf-connecting-ip');
  const cfRay = headers.get('cf-ray');

  // In production, any request passing through Cloudflare must contain these headers
  return !!(cfConnectingIp && cfRay);
}
