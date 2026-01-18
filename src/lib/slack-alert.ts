import axios from 'axios';
import { logger } from 'utils/logger';
import { getAppEnv, isDev } from './config/env';

export interface SlackAlertOptions {
  level?: 'info' | 'warn' | 'error' | 'critical';
  metadata?: Record<string, unknown>; // Safer than 'any'
  title?: string;
  force?: boolean; // Bypass rate limiting for critical system events
}

// Internal Type Definitions for Slack Block Kit
interface SlackField {
  type: 'mrkdwn' | 'plain_text';
  text: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  fields?: SlackField[];
  elements?: { type: string; text: string }[];
}

// In-memory cache for rate-limiting alerts
const alertCache = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60 * 1000;

export async function sendSlackAlert(message: string, options: SlackAlertOptions = {}): Promise<boolean> {
  if (isDev) {
    const { level = 'info' } = options;
    logger.log(`[SlackAlert Simulator] ${level.toUpperCase()}: ${message}`);
    return true;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.warn('[SlackAlert] SLACK_WEBHOOK_URL is not set. Skipping alert.');
    return false;
  }

  const { level = 'info', metadata, title, force = false } = options;

  if (!shouldSendAlert(level, title, message, force)) {
    return false;
  }

  const payload = buildAlertPayload(message, level, title, metadata);

  try {
    const requestPromise = axios.post(webhookUrl, payload, { timeout: 4000 });

    if (level === 'critical') {
      await requestPromise;
    } else {
      // Fire and forget
      requestPromise.catch((e: Error) => logger.error(`[SlackAlert] Background send failed: ${e.message}`));
    }

    return true;
  } catch (err) {
    logger.error('[SlackAlert] Failed to send Slack alert:', err);
    return false;
  }
}

function shouldSendAlert(level: string, title: string | undefined, message: string, force: boolean): boolean {
  if (force) return true;
  
  const cacheKey = `${level}:${title || 'alert'}:${message.substring(0, 50)}`;
  const now = Date.now();
  
  if (alertCache.has(cacheKey)) {
    const lastSent = alertCache.get(cacheKey)!;
    if (now - lastSent < RATE_LIMIT_WINDOW) {
      return false;
    }
  }
  
  alertCache.set(cacheKey, now);
  return true;
}

function buildAlertPayload(
  message: string, 
  level: 'info' | 'warn' | 'error' | 'critical', 
  title: string | undefined, 
  metadata: Record<string, unknown> | undefined
) {
  const config = getLevelConfig(level);
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${config.emoji} ${config.label}: ${title || 'Security Notification'}*`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: message
      }
    }
  ];

  if (metadata && Object.keys(metadata).length > 0) {
    const metadataBlocks = createMetadataBlocks(metadata);
    blocks.push(...metadataBlocks);
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📍 *Env:* ${getAppEnv()} | 🕒 *Time:* ${new Date().toISOString()}`
      }
    ]
  });

  return {
    text: `${config.emoji} ${title || 'Security Alert'}: ${message}`,
    attachments: [
      {
        color: config.color,
        blocks
      }
    ]
  };
}

function getLevelConfig(level: string) {
  const configs: Record<string, { emoji: string; color: string; label: string }> = {
    info: { emoji: 'ℹ️', color: '#2EB67D', label: 'INFO' },
    warn: { emoji: '⚠️', color: '#ECB22E', label: 'WARNING' },
    error: { emoji: '�', color: '#E01E5A', label: 'ERROR' },
    critical: { emoji: '🔥', color: '#E01E5A', label: 'CRITICAL' },
  };
  return configs[level] || configs['info']!;
}

function createMetadataBlocks(metadata: Record<string, unknown>): SlackBlock[] {
  const fields = Object.entries(metadata)
    .filter((entry) => entry[1] !== undefined && entry[1] !== null)
    .map(([key, value]) => ({
      type: 'mrkdwn' as const,
      text: `*${key}:*\n\`${typeof value === 'object' ? JSON.stringify(value) : String(value)}\``
    }));

  const blocks: SlackBlock[] = [];
  // Slack allows max 10 fields per section
  for (let i = 0; i < fields.length; i += 10) {
    blocks.push({
      type: 'section',
      fields: fields.slice(i, i + 10)
    });
  }
  return blocks;
}