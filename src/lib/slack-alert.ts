import axios from 'axios';
import { logger } from 'utils/logger';

export interface SlackAlertOptions {
  level?: 'info' | 'warn' | 'error' | 'critical';
  metadata?: Record<string, any>;
  title?: string;
  force?: boolean; // Bypass rate limiting for critical system events
}

// In-memory cache for rate-limiting alerts (to prevent flooding Slack)
const alertCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window for similar alerts

/**
 * Sends a rich formatted alert to Slack using Block Kit & Attachments
 */
export async function sendSlackAlert(message: string, options: SlackAlertOptions = {}): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn('[SlackAlert] SLACK_WEBHOOK_URL is not set. Skipping alert.');
    }
    return false;
  }

  const { level = 'info', metadata, title, force = false } = options;

  // 1. Simple Rate Limiting Logic
  const cacheKey = `${level}:${title || 'alert'}:${message.substring(0, 50)}`;
  const now = Date.now();
  if (!force && alertCache.has(cacheKey)) {
    const lastSent = alertCache.get(cacheKey)!;
    if (now - lastSent < RATE_LIMIT_WINDOW) {
      // Skip if sent too recently
      return false;
    }
  }
  alertCache.set(cacheKey, now);

  // 2. Map level to visuals
  const levelConfig = {
    info: { emoji: 'ℹ️', color: '#2EB67D', label: 'INFO' },
    warn: { emoji: '⚠️', color: '#ECB22E', label: 'WARNING' },
    error: { emoji: '🚨', color: '#E01E5A', label: 'ERROR' },
    critical: { emoji: '🔥', color: '#E01E5A', label: 'CRITICAL' },
  }[level];

  // 3. Construct Payload (Using Attachments for the color sidebar - more professional)
  const payload = {
    text: `${levelConfig.emoji} ${title || 'Security Alert'}: ${message}`,
    attachments: [
      {
        color: levelConfig.color,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${levelConfig.emoji} ${levelConfig.label}: ${title || 'Security Notification'}*`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          }
        ]
      }
    ]
  };

  // 4. Add Metadata Fields
  if (metadata && Object.keys(metadata).length > 0) {
    const fields = Object.entries(metadata)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:*\n\`${typeof value === 'object' ? JSON.stringify(value) : value}\``
      }));

    // Slack allows max 10 fields per section. We'll use multiple sections if needed.
    for (let i = 0; i < fields.length; i += 10) {
      (payload.attachments[0].blocks as any[]).push({
        type: 'section',
        fields: fields.slice(i, i + 10)
      });
    }
  }

  // 5. Add Context (Environment, Timestamp)
  (payload.attachments[0].blocks as any[]).push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📍 *Env:* ${process.env.NODE_ENV || 'prod'} | 🕒 *Time:* ${new Date().toISOString()}`
      }
    ]
  });

  try {
    // We don't await this if it's not 'critical' to keep the app fast
    const promise = axios.post(webhookUrl, payload, { timeout: 4000 });

    if (level === 'critical') {
      await promise;
    } else {
      // Fire and forget but catch errors
      promise.catch(e => logger.error('[SlackAlert] Background send failed:', e.message));
    }

    return true;
  } catch (err) {
    logger.error('[SlackAlert] Failed to send Slack alert:', err);
    return false;
  }
}