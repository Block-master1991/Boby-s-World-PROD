import redis from './redis';
import { NextResponse } from 'next/server';
import { logRateLimitExceeded } from './log-rate-limit';
import { sendSlackAlert } from './slack-alert';
import { performance } from 'perf_hooks';
import { isIpInList } from './ip-list';
import { getClientIp } from './request-utils';

// تصفية user-agent
function sanitizeUserAgent(userAgentRaw: string | null): string {
  if (!userAgentRaw || userAgentRaw.length < 8) return 'unknown';
  const lower = userAgentRaw.toLowerCase();
  if (
    lower === 'unknown' ||
    lower.includes('bot') ||
    lower.includes('curl') ||
    lower.includes('python') ||
    lower.includes('wget') ||
    lower.includes('httpclient')
  ) {
    return 'unknown';
  }
  return userAgentRaw.slice(0, 100);
}

export async function rateLimit(
  request: Request,
  endpoint: string,
  publicKey?: string,
  options?: { windowSeconds?: number; maxAttempts?: number, mode?: 'ip' | 'user-agent' | 'publicKey' | 'user-agent-publicKey' }
) {
  try {
    const ip = getClientIp(request);

    // تحقق من القائمة البيضاء في Firestore (مع كاش)
    if (await isIpInList('whitelist', ip)) return null;

    // تحقق من القائمة السوداء في Firestore (مع كاش)
    if (await isIpInList('blacklist', ip)) {
      return NextResponse.json(
        { error: 'Access denied. Your IP is blacklisted by admin.' },
        { status: 429 }
      );
    }

    const userAgent = sanitizeUserAgent(request.headers.get('user-agent'));
    if (userAgent === 'unknown') {
      return NextResponse.json({ error: 'Invalid user-agent' }, { status: 400 });
    }

    // تحديد نوع الحماية حسب mode
    let key = `ratelimit:${endpoint}:`;
    const mode = options?.mode ?? 'ip';
    if (mode === 'ip') {
      key += `${ip}:${userAgent}`;
      if (publicKey) key += `:${publicKey}`;
    } else if (mode === 'user-agent') {
      key += `${userAgent}`;
    } else if (mode === 'publicKey' && publicKey) {
      key += `${publicKey}`;
    } else if (mode === 'user-agent-publicKey' && publicKey) {
      key += `${userAgent}:${publicKey}`;
    } else {
      key += `${ip}:${userAgent}`;
    }

    const windowSeconds = options?.windowSeconds ?? 60;
    const maxAttempts = options?.maxAttempts ?? 5;

    // مراقبة أداء Redis
    const startRedis = performance.now();
    let attempts;
    try {
      attempts = await redis.incr(key);
    } catch (err) {
      console.error('Redis incr failed:', err);
      return NextResponse.json({ error: 'Server busy, try again later.' }, { status: 503 });
    }
    const endRedis = performance.now();
    if (endRedis - startRedis > 100) {
      console.warn(`[PERF] Redis.incr took ${endRedis - startRedis}ms for key ${key}`);
    }

    if (attempts === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (attempts > maxAttempts) {
      // عداد تجاوز الحد لهذا الـ IP
      const alertKey = `ratelimit:alert:${ip}`;
      const alertAttempts = await redis.incr(alertKey);
      if (alertAttempts === 1) {
        await redis.expire(alertKey, 600); // 10 دقائق

        // تنبيه عند أول تجاوز
        const startSlack = performance.now();
        try {
          await sendSlackAlert(
            `⚠️ *First Rate Limit Exceeded*\nIP: ${ip}\nEndpoint: ${endpoint}\nUser-Agent: ${userAgent}\nAttempts: ${attempts}\nTime: ${new Date().toISOString()}`
          );
        } catch (err) {
          console.error('Slack alert failed:', err);
        }
        const endSlack = performance.now();
        if (endSlack - startSlack > 2000) {
          console.warn(`[PERF] Slack alert took ${endSlack - startSlack}ms`);
        }
      }

      // مدة الحظر المؤقت تتغير حسب عدد مرات التجاوز
      let blockDuration = 600; // 10 دقائق
      if (alertAttempts >= 5) {
        blockDuration = 3600; // ساعة
      } else if (alertAttempts >= 3) {
        blockDuration = 1800; // نصف ساعة
      }
      await redis.expire(key, blockDuration);

      // إضافة IP للقائمة السوداء إذا تجاوز كثيرًا
      if (alertAttempts >= 7) {
        await redis.set(`ratelimit:blacklist:${ip}`, '1', 'EX', 86400); // 24 ساعة
        await sendSlackAlert(
          `⛔ *IP Blacklisted*\nIP: ${ip}\nEndpoint: ${endpoint}\nUser-Agent: ${userAgent}\nExceeded rate limit 7+ times. Blocked for 24h.\nTime: ${new Date().toISOString()}`
        );
      }

      // تنبيه عند التكرار
      if (alertAttempts === 3) {
        await sendSlackAlert(
          `🚨 *Rate Limit Abuse Detected*\nIP: ${ip}\nEndpoint: ${endpoint}\nUser-Agent: ${userAgent}\nAttempts: ${attempts} (exceeded 3 times in 10 minutes)\nTime: ${new Date().toISOString()}`
        );
      }

      // سجل كل محاولة تجاوز في Firestore أو خدمة مراقبة
      await logRateLimitExceeded(ip, endpoint, userAgent, publicKey, Date.now());

      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    return null;
  } catch (err) {
    console.error('Rate limit error:', err);
    return null;
  }
}
