/**
 * Rate Limiter Pattern and Behavior Utilities
 */

import { logger } from "utils/logger";
import redis from "../redis";
import type { BehavioralStats, PatternAnalysisResult } from "./types";

/**
 * Detect anomalies in request patterns.
 *
 * @param isIpIdentifier - true when the identifier is a raw IP address (not a userId/publicKey).
 *   When true, User-Agent switch detection is disabled because multiple legitimate users
 *   behind NAT/shared IP will naturally have different User-Agents.
 */
function detectAnomalies(
  patternData: { userAgent?: string; endpoints: Record<string, number[]> },
  userAgent: string,
  isIpIdentifier: boolean
): {
  type: PatternAnalysisResult["type"];
  desc: string;
  score: number;
  flags: Record<string, boolean>;
} {
  const uniqueEndpoints = Object.keys(patternData.endpoints).length;
  const hasConcentration = Object.values(patternData.endpoints).some(
    arr => Array.isArray(arr) && arr.length > 20
  );

  // UA-switch detection is ONLY meaningful when keyed on a specific user.
  // IP-keyed identifiers represent potentially many users (NAT, office networks,
  // mobile carrier NATs), so UA changes are expected and should not be flagged.
  const uaChanged =
    !isIpIdentifier &&
    patternData.userAgent !== undefined &&
    patternData.userAgent !== userAgent;

  const flags = {
    tooManyEndpoints: uniqueEndpoints > 10,
    rapidSwitches: uaChanged,
  };

  if (flags.tooManyEndpoints && hasConcentration) {
    return {
      type: "unusual_pattern",
      desc: "Multiple endpoint reconnaissance attempt",
      score: 25,
      flags,
    };
  }

  if (flags.rapidSwitches) {
    return { type: "bot_signature", desc: "Suspicious User-Agent change", score: 30, flags };
  }

  return { type: "rapid_requests", desc: "", score: 0, flags };
}

/**
 * Analyze request patterns for suspicious behavior.
 *
 * @param identifier - Can be an IP address (guest/unauthenticated) or a userId/publicKey (authenticated).
 *   The distinction controls whether User-Agent switching is treated as suspicious.
 */
export async function analyzeRequestPatterns(
  identifier: string,
  endpoint: string,
  userAgent: string
): Promise<PatternAnalysisResult> {
  const patternKey = `ratelimit:patterns:${identifier}`;

  // Determine if this identifier is a raw IP (IPv4 or IPv6) vs a userId/publicKey.
  // IPv4: contains dots and only digits+dots. IPv6: contains colons.
  const isIpIdentifier = /^(\d{1,3}\.){3}\d{1,3}$/.test(identifier) || identifier.includes(":");

  try {
    const rawPatterns = await redis?.get(patternKey);
    const patternData = rawPatterns
      ? JSON.parse(rawPatterns)
      : {
          endpoints: {} as Record<string, number[]>,
          userAgent: userAgent,
          lastUpdate: Date.now(),
          flags: {},
        };

    const now = Date.now();
    if (!patternData.endpoints[endpoint]) patternData.endpoints[endpoint] = [];
    patternData.endpoints[endpoint].push(now);

    // Cleanup old requests (> 1 hour)
    const hourAgo = now - 3600000;
    for (const ep in patternData.endpoints) {
      patternData.endpoints[ep] = patternData.endpoints[ep].filter((t: number) => t > hourAgo);
    }

    const anomaly = detectAnomalies(patternData, userAgent, isIpIdentifier);

    patternData.userAgent = userAgent; // Update for next comparison
    patternData.lastUpdate = now;
    patternData.flags = anomaly.flags;

    redis?.setex(patternKey, 3600, JSON.stringify(patternData)).catch(() => {});

    return {
      type: anomaly.type,
      description: anomaly.desc,
      evidence: patternData as unknown as Record<string, unknown>,
      score: anomaly.score,
    };
  } catch (error) {
    logger.error("[RateLimit:Patterns] Error in pattern analysis:", error);
    return {
      type: "rapid_requests",
      description: "Error in pattern analysis",
      evidence: null,
      score: 0,
    };
  }
}

/**
 * Adaptive behavioral analysis (Exponential Moving Average).
 *
 * Detects sudden frequency spikes compared to the user's established baseline.
 * Tuning notes:
 * - Warmup period is 20 requests (was 10) to get a stable EMA baseline.
 * - Deviation threshold is 8x (was 3x) to tolerate Next.js parallel prefetch bursts.
 * - Frequency threshold is 20 req/sec (was 5) before triggering concern.
 * - Penalty increment is +10 (was +25) per flagged request for gentler escalation.
 * - Natural decay (no suspicious burst) is -3 per request (was -2) for faster recovery.
 */
export function analyzeBehavior(
  identifier: string,
  behaviorMap: Map<string, BehavioralStats>
): number {
  const now = Date.now();
  let stats = behaviorMap.get(identifier);

  if (!stats) {
    stats = { avgFrequency: 0, requestCount: 0, lastRequestTime: now, deviationScore: 0 };
  }

  const timeSinceLast = now - stats.lastRequestTime;
  stats.requestCount++;

  // Only evaluate deviation after establishing a baseline (20 requests).
  if (stats.requestCount > 20) {
    const alpha = 0.1;
    // Cap instantaneous frequency at 200 req/sec to avoid infinity from parallel requests.
    const currentFreq = timeSinceLast > 0 ? Math.min(1000 / timeSinceLast, 200) : 200;

    if (stats.avgFrequency > 0) {
      const deviation = Math.abs(currentFreq - stats.avgFrequency) / stats.avgFrequency;
      // Flag only extreme deviations: > 8x baseline AND > 20 req/sec.
      // This avoids false positives from Next.js parallel asset prefetching.
      if (deviation > 8 && currentFreq > 20) {
        stats.deviationScore = Math.min(100, stats.deviationScore + 10);
        // KEY: Do NOT update EMA during a burst — keep the baseline stable.
        // This ensures sustained bot activity keeps being flagged (EMA doesn't
        // absorb the attacker's frequency and normalize it away).
      } else {
        stats.deviationScore = Math.max(0, stats.deviationScore - 3);
        // Only advance the EMA for non-deviant requests to preserve baseline integrity.
        stats.avgFrequency = alpha * currentFreq + (1 - alpha) * stats.avgFrequency;
      }
    } else {
      stats.avgFrequency = alpha * currentFreq + (1 - alpha) * stats.avgFrequency;
    }

  } else {
    const initialFreq = timeSinceLast > 0 ? 1000 / timeSinceLast : 500;
    stats.avgFrequency =
      stats.requestCount === 1 ? initialFreq : (stats.avgFrequency + initialFreq) / 2;
  }

  stats.lastRequestTime = now;
  behaviorMap.set(identifier, stats);

  return stats.deviationScore;
}
