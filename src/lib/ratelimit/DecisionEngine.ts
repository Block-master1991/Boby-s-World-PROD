/**
 * Rate Limiter Decision Engine
 */

import type {
    AdaptiveLimits,
    PatternAnalysisResult,
    RateLimitResult
} from './types';

/**
 * Calculate adaptive limits based on reputation and risk
 */
export function calculateAdaptiveLimits(params: {
    reputation: number;
    riskScore: number;
    baseLimit: number;
    maxBurst: number;
    windowSize: number;
    customLimit?: number | undefined;
}): AdaptiveLimits {
    const { reputation, riskScore, baseLimit, maxBurst, windowSize, customLimit } = params;
    const reputationMultiplier = reputation / 100;
    const effectiveBase = customLimit || baseLimit;
    const riskPenalty = Math.max(0, (riskScore - 50) / 50);

    return {
        baseLimit: Math.floor(effectiveBase * reputationMultiplier),
        burstLimit: Math.floor(maxBurst * reputationMultiplier),
        windowSize,
        reputationMultiplier,
        riskAdjustment: riskPenalty
    };
}

/**
 * Synthesize all findings into a final RateLimitResult
 */
export function synthesizeResults(params: {
    sliding: { allowed: boolean; count: number; remaining: number };
    burst: { allowed: boolean; burstCount: number };
    pattern: PatternAnalysisResult;
    riskScore: number;
    limits: AdaptiveLimits;
    thresholds: { challenge: number; block: number };
}): RateLimitResult {
    const { sliding, burst, pattern, riskScore, limits, thresholds } = params;
    const combinedRisk = Math.min(100, riskScore + pattern.score);

    let action: RateLimitResult['action'] = 'allow';
    let allowed = true;
    let retryAfter: number | undefined;

    if (combinedRisk >= thresholds.block) {
        action = 'block';
        allowed = false;
        retryAfter = 3600;
    } else if (combinedRisk >= thresholds.challenge) {
        action = 'challenge';
        allowed = false;
        retryAfter = 300;
    } else if (!sliding.allowed || !burst.allowed) {
        action = 'block';
        allowed = false;
        retryAfter = 60;
    }

    return {
        allowed,
        action,
        retryAfter,
        currentCount: sliding.count,
        limit: limits.baseLimit,
        remaining: sliding.remaining,
        riskScore: combinedRisk
    };
}
