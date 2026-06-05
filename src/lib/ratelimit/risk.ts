/**
 * Rate Limiter Risk and Reputation Utilities
 */

import { logger } from "utils/logger";
import type { DeviceInfo } from "../advancedSessionManager";
import redis from "../redis";

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
      // Reward for real browsers
      if (deviceInfo.plugins.length > 0) score += 5;

      // Reward for common timezones
      const reasonableTimezone = ["UTC", "GMT", "EST", "PST", "CET", "EET"];
      if (reasonableTimezone.some(tz => deviceInfo.timezone.includes(tz))) {
        score += 3;
      }

      // Penalty for bots/scripts
      const ua = deviceInfo.userAgent.toLowerCase();
      if (ua.includes("bot") || ua.includes("crawler") || ua.includes("python")) {
        score -= 20;
      }
    }

    // Apply decay and bounds
    score = Math.max(0, Math.min(100, score * decayRate));

    // Save (Fire and Forget)
    redis.setex(reputationKey, 3600, score.toString()).catch(() => {});

    return score;
  } catch (error) {
    logger.error("[RateLimit:Risk] Error in calculating reputation:", error);
    return 50;
  }
}

/**
 * Calculate device-specific risk components
 */
function calculateDeviceRisk(deviceInfo: DeviceInfo): number {
  let risk = 0;

  // Resolution check
  if (deviceInfo.screenResolution) {
    const parts = deviceInfo.screenResolution.split("x");
    const width = parts[0] ? Number(parts[0]) : undefined;
    const height = parts[1] ? Number(parts[1]) : undefined;

    if (width !== undefined && height !== undefined) {
      if (width < 400 || height < 400 || width > 8000 || height > 6000) {
        risk += 15;
      }
    }
  }

  // Hardware/Environment checks
  if (
    deviceInfo.hardwareConcurrency &&
    (deviceInfo.hardwareConcurrency < 1 || deviceInfo.hardwareConcurrency > 64)
  ) {
    risk += 10;
  }

  if (deviceInfo.plugins.length === 0) {
    risk += 20;
  }

  if (!deviceInfo.timezone) {
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
