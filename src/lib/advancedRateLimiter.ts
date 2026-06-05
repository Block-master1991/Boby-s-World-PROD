/**
 * Advanced Rate Limiter - Intelligent and advanced rate limiting system
 */

import { logger } from "utils/logger";
import type { DeviceInfo } from "./advancedSessionManager";
import { blockIp, isIpInList } from "./ip-list";
import { calculateAdaptiveLimits, synthesizeResults } from "./ratelimit/DecisionEngine";
import { analyzeBehavior, analyzeRequestPatterns } from "./ratelimit/patterns";
import { calculateRiskScore, calculateUserReputation } from "./ratelimit/risk";
import type {
  AdaptiveLimits,
  BehavioralStats,
  PatternAnalysisResult,
  RateLimitResult,
  SuspiciousActivity,
} from "./ratelimit/types";
import redis from "./redis";
import { getClientIp } from "./request-utils";
import { SecurityEventLevel, securityLogger } from "./securityLogger";

export type {
  AdaptiveLimits,
  BehavioralStats,
  PatternAnalysisResult,
  RateLimitResult,
  SuspiciousActivity,
};

export class AdvancedRateLimiter {
  private static instance: AdvancedRateLimiter;
  private readonly BASE_LIMIT = 150;
  private readonly SLIDING_WINDOW = 60000;
  private readonly MAX_BURST = 30;
  private readonly REPUTATION_DECAY = 0.95;
  private readonly CHALLENGE_THRESHOLD = 70;
  private readonly BLOCK_THRESHOLD = 90;

  private userReputation = new Map<string, { score: number; lastActivity: number }>();
  private userBehavioralStats = new Map<string, BehavioralStats>();
  private localWindow = new Map<string, number[]>();

  private constructor() {
    this.initializeCleanup();
  }

  public static getInstance(): AdvancedRateLimiter {
    if (!AdvancedRateLimiter.instance) {
      AdvancedRateLimiter.instance = new AdvancedRateLimiter();
    }
    return AdvancedRateLimiter.instance;
  }

  private initializeCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, data] of this.userReputation) {
        if (now - data.lastActivity > 3600000) this.userReputation.delete(id);
      }
      for (const [id, stats] of this.userBehavioralStats) {
        if (now - stats.lastRequestTime > 7200000) this.userBehavioralStats.delete(id);
      }
    }, 1800000);
  }

  private async logSuspiciousActivity(
    ip: string,
    endpoint: string,
    activity: SuspiciousActivity
  ): Promise<void> {
    try {
      await securityLogger.logEvent({
        type: activity.type,
        level:
          activity.severity === "critical" ? SecurityEventLevel.CRITICAL : SecurityEventLevel.WARN,
        message: activity.description,
        ip,
        endpoint,
        evidence: activity.evidence,
      });

      const logData = { ...activity, ip, endpoint, timestamp: Date.now() };
      if (redis) {
        await redis.lpush("suspicious_activity", JSON.stringify(logData));
        await redis.ltrim("suspicious_activity", 0, 99);
        await redis.expire("suspicious_activity", 86400);
      }
      logger.warn("[AdvancedRateLimiter] Suspicious activity:", logData);
    } catch (error) {
      logger.error("[AdvancedRateLimiter] Error logging activity:", error);
    }
  }

  /**
   * Check Rate Limit
   */
  public async checkRateLimit(
    request: Request,
    identifier: string,
    context: {
      endpoint: string;
      deviceInfo?: DeviceInfo | undefined;
      options?: { customLimit?: number; bypassMode?: boolean } | undefined;
    }
  ): Promise<RateLimitResult> {
    try {
      const { endpoint, deviceInfo, options } = context;
      const ip = getClientIp(request);
      if (this.isLocalhost(ip, request) || options?.bypassMode)
        return { allowed: true, action: "allow" };

      if (await isIpInList("whitelist", ip)) return { allowed: true, action: "allow" };
      if (await isIpInList("blacklist", ip)) return this.handleBlacklisted(ip, endpoint);

      const isPanicMode = (await redis?.get("security:panic_mode")) === "1";
      const reputation = await calculateUserReputation(
        identifier,
        deviceInfo,
        this.REPUTATION_DECAY
      );
      const initialRisk = await calculateRiskScore(identifier, deviceInfo, endpoint);
      const riskWithPanic = isPanicMode ? initialRisk + 50 : initialRisk;

      const limits = calculateAdaptiveLimits({
        reputation,
        riskScore: riskWithPanic,
        baseLimit: isPanicMode ? Math.floor(this.BASE_LIMIT * 0.2) : this.BASE_LIMIT,
        maxBurst: isPanicMode ? Math.floor(this.MAX_BURST * 0.2) : this.MAX_BURST,
        windowSize: this.SLIDING_WINDOW,
        customLimit: options?.customLimit,
      });

      const results = await this.getEnforcementResults(identifier, endpoint, request, limits);
      const behavioralRisk = analyzeBehavior(identifier, this.userBehavioralStats);

      const finalResult = synthesizeResults({
        sliding: results.sliding,
        burst: results.burst,
        pattern: results.pattern,
        riskScore: riskWithPanic + behavioralRisk,
        limits,
        thresholds: { challenge: this.CHALLENGE_THRESHOLD, block: this.BLOCK_THRESHOLD },
      });

      if (finalResult.action !== "allow") {
        await this.handleEnforcementAction(ip, endpoint, finalResult, results.pattern);
      }

      return finalResult;
    } catch (error) {
      logger.error("[AdvancedRateLimiter] Error in rate limit check:", error);
      return { allowed: true, action: "warn" };
    }
  }

  private isLocalhost(ip: string, request?: Request): boolean {
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (isLocal) return true;

    // In development, allow ngrok tunnels
    if (process.env.NODE_ENV === "development" && request) {
      const host = request.headers.get("host") || "";
      if (host.includes("ngrok-free.app") || host.includes("ngrok.io")) {
        return true;
      }
    }
    return false;
  }

  private async handleBlacklisted(ip: string, endpoint: string): Promise<RateLimitResult> {
    redis?.incr("stats:blocked_requests").catch(() => {});
    await this.logSuspiciousActivity(ip, endpoint, {
      type: "blacklisted_ip",
      severity: "critical",
      score: 100,
      description: "Attempted access from blocked IP",
      evidence: { ip, timestamp: new Date().toISOString() },
    });
    return { allowed: false, retryAfter: 3600, action: "block" };
  }

  private async getEnforcementResults(
    id: string,
    ep: string,
    req: Request,
    limits: AdaptiveLimits
  ) {
    const ua = req.headers.get("user-agent") || "";
    try {
      const results = await Promise.all([
        this.checkSlidingWindow(id, ep, limits),
        this.checkBurstPattern(id, ep),
        analyzeRequestPatterns(id, ep, ua),
      ]);
      return { sliding: results[0], burst: results[1], pattern: results[2] };
    } catch {
      return {
        sliding: this.checkLocalSlidingWindow(id, ep, limits),
        burst: { allowed: true, burstCount: 0 },
        pattern: {
          type: "rapid_requests",
          description: "Fallback active",
          evidence: null,
          score: 0,
        } as PatternAnalysisResult,
      };
    }
  }

  private async handleEnforcementAction(
    ip: string,
    ep: string,
    result: RateLimitResult,
    pattern: PatternAnalysisResult
  ) {
    try {
      await this.logSuspiciousActivity(ip, ep, {
        type: pattern.type,
        severity: (result.riskScore || 0) >= 80 ? "critical" : "high",
        score: result.riskScore || 0,
        description: pattern.description,
        evidence: pattern.evidence,
      });
      if (result.action === "block") {
        await blockIp(ip, `Automated Block: ${pattern.description} (Score: ${result.riskScore})`);
      }
    } catch {
      /* ignore */
    }
  }

  private async checkSlidingWindow(id: string, ep: string, limits: AdaptiveLimits) {
    const key = `sliding:${id}:${ep}`;
    const now = Date.now();
    if (redis) {
      await redis.zremrangebyscore(key, 0, now - limits.windowSize);
      const currentCount = (await redis.zcard(key)) || 0;
      await redis.zadd(key, now, `${now}:${Math.random()}`);
      await redis.expire(key, Math.ceil(limits.windowSize / 1000));
      return {
        allowed: currentCount < limits.baseLimit,
        count: currentCount,
        remaining: Math.max(0, limits.baseLimit - currentCount),
      };
    }
    return this.checkLocalSlidingWindow(id, ep, limits);
  }

  private checkLocalSlidingWindow(id: string, ep: string, limits: AdaptiveLimits) {
    const key = `${id}:${ep}`;
    const now = Date.now();
    const timestamps = (this.localWindow.get(key) || []).filter(t => t > now - limits.windowSize);
    timestamps.push(now);
    this.localWindow.set(key, timestamps);
    return {
      allowed: timestamps.length <= limits.baseLimit,
      count: timestamps.length,
      remaining: Math.max(0, limits.baseLimit - timestamps.length),
    };
  }

  private async checkBurstPattern(id: string, ep: string) {
    const key = `burst:${id}:${ep}`;
    const now = Date.now();
    if (redis) {
      const burstCount = (await redis.zcard(key)) || 0;
      await redis.zadd(key, now, `${now}:${Math.random()}`);
      await redis.expire(key, 300);
      return { allowed: burstCount < this.MAX_BURST, burstCount };
    }
    return { allowed: true, burstCount: 0 };
  }

  public getStats(): {
    activeIdentifiers: number;
    reputationCacheSize: number;
    patternCacheSize: number;
  } {
    return {
      activeIdentifiers: this.userReputation.size,
      reputationCacheSize: this.userReputation.size,
      patternCacheSize: 0,
    };
  }

  // Internal access for tests (preserved original names for index-access compatibility)
  public calculateRiskScore(id: string, dev?: DeviceInfo, ep?: string): Promise<number> {
    return calculateRiskScore(id, dev, ep);
  }

  public analyzeBehavior(id: string) {
    return analyzeBehavior(id, this.userBehavioralStats);
  }

  public cleanup(): void {
    this.userReputation.clear();
    this.userBehavioralStats.clear();
    this.localWindow.clear();
  }
}

export const advancedRateLimiter = AdvancedRateLimiter.getInstance();
