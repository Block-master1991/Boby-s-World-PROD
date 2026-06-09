/**
 * Rate Limiter Risk and Reputation Utilities
 */

import { logger } from "utils/logger";
import redis from "../redis";
import type { DeviceInfo } from "../session/advancedSessionManager";

/**
 * Calculate user reputation based on device and history
 */
export async function calculateUserReputation(
  identifier: string,
  deviceInfo?: DeviceInfo,
  decayRate: number = 0.95
): Promise<number> {
  try {
    const reputationKey = `reputation:${identifier}`;
    const existing = await redis.get(reputationKey);

    let score = existing ? parseInt(existing) : 100;

    if (deviceInfo) {
      // NOTE: `plugins` is always empty in modern browsers (NPAPI deprecated).
      // We no longer give a bonus for having plugins populated.

      // Penalty for explicit bot/scraper user-agents
      const ua = deviceInfo.userAgent.toLowerCase();
      if (ua.includes("bot") || ua.includes("crawler") || ua.includes("python") || ua.includes("curl")) {
        score -= 20;
      }

      // Reward for having a valid timezone (attacker scripts often omit this)
      if (deviceInfo.timezone && deviceInfo.timezone.length > 0) {
        score += 2;
      }
    }

    // Check consecutive failures
    const failuresKey = `consecutive_failures:${identifier}`;
    const failuresVal = await redis.get(failuresKey);
    const failures = failuresVal ? parseInt(failuresVal, 10) : 0;

    // Apply decay and bounds only if we have 10 or more consecutive failures
    if (failures >= 10) {
      score = Math.max(0, Math.min(100, score * decayRate));
    } else {
      score = Math.max(0, Math.min(100, score));
    }

    // Save (Fire and Forget)
    redis.setex(reputationKey, 3600, score.toString()).catch(() => {});

    return score;
  } catch (error) {
    logger.error("[RateLimit:Risk] Error in calculating reputation:", error);
    return 50;
  }
}

/**
 * Calculate device-specific risk components.
 * All penalties are calibrated for real-world modern browsers and mobile devices.
 */
function calculateDeviceRisk(deviceInfo: DeviceInfo): number {
  let risk = 0;

  // Screen resolution check — only flag clearly bogus or missing values.
  // Modern phones (iPhone SE: 375px, older Androids: 320px) must NOT be penalized.
  // Lower bound 320px is the smallest valid mobile screen width.
  if (deviceInfo.screenResolution) {
    const parts = deviceInfo.screenResolution.split("x");
    const width = parts[0] ? Number(parts[0]) : 0;
    const height = parts[1] ? Number(parts[1]) : 0;

    const isInvalidWidth = width === 0 || width < 320 || width > 8000;
    const isInvalidHeight = height === 0 || height < 240 || height > 6000;

    if (isInvalidWidth || isInvalidHeight) {
      risk += 15;
    }
  }

  // Hardware concurrency: only penalize impossible values (0 or > 128 cores).
  // Headless chromium reports 2 cores; that's perfectly valid.
  if (
    deviceInfo.hardwareConcurrency !== undefined &&
    deviceInfo.hardwareConcurrency !== null &&
    (deviceInfo.hardwareConcurrency < 1 || deviceInfo.hardwareConcurrency > 128)
  ) {
    risk += 10;
  }

  // NOTE: We intentionally do NOT penalize for plugins === 0.
  // NPAPI plugins are deprecated and disabled in all modern browsers (Chrome, Firefox, Edge, Safari).
  // The server-side device info extractor always sends plugins: [], so this check would
  // penalize ALL authenticated API calls.

  // Missing timezone is suspicious — legitimate browsers always have one.
  if (!deviceInfo.timezone || deviceInfo.timezone.trim() === "") {
    risk += 10;
  }

  return risk;
}

/**
 * Calculate endpoint-specific risk components
 */
function calculateEndpointRisk(endpoint: string): number {
  const sensitiveEndpoints = ["/api/auth", "/api/admin", "/api/crypto"];
  return sensitiveEndpoints.some(ep => endpoint.includes(ep)) ? 5 : 0;
}

/**
 * Calculate historical pattern risk from Redis
 */
async function calculateHistoricalRisk(identifier: string): Promise<number> {
  try {
    const patternKey = `ratelimit:patterns:${identifier}`;
    const recentPatterns = await redis.get(patternKey);
    if (!recentPatterns) return 0;

    const patterns = JSON.parse(recentPatterns);
    let risk = 0;
    if (patterns.flags?.tooManyEndpoints) risk += 15;
    if (patterns.flags?.rapidSwitches) risk += 10;
    return risk;
  } catch {
    return 0;
  }
}

/**
 * Calculate instantaneous risk score
 */
export async function calculateRiskScore(
  identifier: string,
  deviceInfo?: DeviceInfo,
  endpoint?: string
): Promise<number> {
  let riskScore = 0;

  if (deviceInfo) {
    riskScore += calculateDeviceRisk(deviceInfo);
  }

  if (endpoint) {
    riskScore += calculateEndpointRisk(endpoint);
  }

  riskScore += await calculateHistoricalRisk(identifier);

  return Math.min(riskScore, 100);
}
