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
