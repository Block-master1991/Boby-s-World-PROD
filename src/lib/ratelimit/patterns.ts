/**
 * Rate Limiter Pattern and Behavior Utilities
 */

import { logger } from "utils/logger";
import redis from "../redis";
import type { BehavioralStats, PatternAnalysisResult } from "./types";

/**
 * Detect anomalies in request patterns
 */
function detectAnomalies(
  patternData: { userAgent?: string; endpoints: Record<string, number[]> },
  userAgent: string
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

  const flags = {
    tooManyEndpoints: uniqueEndpoints > 10,
    rapidSwitches: patternData.userAgent !== undefined && patternData.userAgent !== userAgent,
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
 * Analyze request patterns for suspicious behavior
 */
export async function analyzeRequestPatterns(
  identifier: string,
  endpoint: string,
  userAgent: string
): Promise<PatternAnalysisResult> {
  const patternKey = `ratelimit:patterns:${identifier}`;

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

    const anomaly = detectAnomalies(patternData, userAgent);

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
 * Adaptive behavioral analysis (Exponential Moving Average)
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

  if (stats.requestCount > 10) {
    const alpha = 0.1;
    const currentFreq = timeSinceLast > 0 ? 1000 / timeSinceLast : 2000;

    if (stats.avgFrequency > 0) {
      const deviation = Math.abs(currentFreq - stats.avgFrequency) / stats.avgFrequency;
      if (deviation > 3 && currentFreq > 5) {
        stats.deviationScore = Math.min(100, stats.deviationScore + 25);
      } else {
        stats.deviationScore = Math.max(0, stats.deviationScore - 2);
      }
    }
    stats.avgFrequency = alpha * currentFreq + (1 - alpha) * stats.avgFrequency;
  } else {
    const initialFreq = timeSinceLast > 0 ? 1000 / timeSinceLast : 500;
    stats.avgFrequency =
      stats.requestCount === 1 ? initialFreq : (stats.avgFrequency + initialFreq) / 2;
  }

  stats.lastRequestTime = now;
  behaviorMap.set(identifier, stats);

  return stats.deviationScore;
}
