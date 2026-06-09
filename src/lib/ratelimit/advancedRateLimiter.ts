/**
 * Advanced Rate Limiter - Intelligent and advanced rate limiting system
 */

import { logger } from "utils/logger";
import { blockIp, isIpInList } from "../ip-list";
import redis from "../redis";
import { getClientIp, isIpWhitelisted } from "../request-utils";
import { SecurityEventLevel, securityLogger } from "../security/securityLogger";
import type { DeviceInfo } from "../session/advancedSessionManager";
import { calculateAdaptiveLimits, synthesizeResults } from "./DecisionEngine";
import { analyzeBehavior, analyzeRequestPatterns } from "./patterns";
import { calculateRiskScore, calculateUserReputation } from "./risk";
import type {
  AdaptiveLimits,
  BehavioralStats,
  PatternAnalysisResult,
  RateLimitResult,
  SuspiciousActivity,
} from "./types";

export type {
  AdaptiveLimits,
  BehavioralStats,
  PatternAnalysisResult,
  RateLimitResult,
  SuspiciousActivity
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
    return AdvancedRateLimiter.instance || (AdvancedRateLimiter.instance = new AdvancedRateLimiter());
  }

  private initializeCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      this.userReputation.forEach((data, id) => { if (now - data.lastActivity > 3600000) this.userReputation.delete(id); });
      this.userBehavioralStats.forEach((stats, id) => { if (now - stats.lastRequestTime > 7200000) this.userBehavioralStats.delete(id); });
    }, 1800000);
  }

  private async logSuspiciousActivity(
    ip: string,
    endpoint: string,
    activity: SuspiciousActivity
  ): Promise<void> {
    try {
      await securityLogger.logEvent({
        type: activity.type, ip, endpoint, evidence: activity.evidence, message: activity.description,
        level: activity.severity === "critical" ? SecurityEventLevel.CRITICAL : SecurityEventLevel.WARN,
      });

      const logData = { ...activity, ip, endpoint, timestamp: Date.now() };
      // Fire-and-forget: Redis persistence is non-critical background bookkeeping.
      // It must never block the rate-limit decision path or add cloud-Redis latency.
      if (redis) {
        redis.lpush("suspicious_activity", JSON.stringify(logData)).catch(() => {});
        redis.ltrim("suspicious_activity", 0, 99).catch(() => {});
        redis.expire("suspicious_activity", 86400).catch(() => {});
      }
      logger.warn("[AdvancedRateLimiter] Suspicious activity:", logData);
    } catch (error) {
      logger.error("[AdvancedRateLimiter] Error logging activity:", error);
    }
  }

  //Check Rate Limit
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

      // Always allow: localhost, bypass mode, and ENV-whitelisted IPs (e.g. ALLOWED_ADMIN_IPS)
      if (
        this.isLocalhost(ip, request) ||
        options?.bypassMode ||
        isIpWhitelisted(ip, process.env["ALLOWED_ADMIN_IPS"] ?? "")
      )
        return { allowed: true, action: "allow" };

      if (await isIpInList("whitelist", ip)) return { allowed: true, action: "allow" };
      if (await isIpInList("blacklist", ip)) return this.handleBlacklisted(ip, endpoint);

      const isPanicMode = (await redis?.get("security:panic_mode")) === "1";
      const reputation = await calculateUserReputation(identifier, deviceInfo, this.REPUTATION_DECAY);
      const initialRisk = await calculateRiskScore(identifier, deviceInfo, endpoint);
      const riskWithPanic = isPanicMode ? initialRisk + 50 : initialRisk;

      const limits = calculateAdaptiveLimits({
        reputation, riskScore: riskWithPanic,
        baseLimit: isPanicMode ? Math.floor(this.BASE_LIMIT * 0.2) : this.BASE_LIMIT,
        maxBurst: isPanicMode ? Math.floor(this.MAX_BURST * 0.2) : this.MAX_BURST,
        windowSize: this.SLIDING_WINDOW, customLimit: options?.customLimit,
      });

      const results = await this.getEnforcementResults(identifier, endpoint, request, limits);
      const behavioralRisk = analyzeBehavior(identifier, this.userBehavioralStats);

      // Cap the behavioral contribution so that a transient burst (e.g. Next.js parallel
      // asset prefetch) alone cannot push a legitimate user over the challenge or block
      // threshold. The behavioral signal is an escalation factor, not a primary driver.
      const cappedBehavioralRisk = Math.min(behavioralRisk, 30);

      const finalResult = synthesizeResults({
        sliding: results.sliding, burst: results.burst, pattern: results.pattern,
        riskScore: riskWithPanic + cappedBehavioralRisk, limits,
        thresholds: { challenge: this.CHALLENGE_THRESHOLD, block: this.BLOCK_THRESHOLD },
      });

      if (finalResult.action !== "allow") {
        await this.handleEnforcementAction(ip, endpoint, finalResult, results.pattern);
        const failuresKey = `consecutive_failures:${identifier}`;
        await redis.incr(failuresKey).catch(() => {});
        await redis.expire(failuresKey, 86400).catch(() => {});
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

      // Only permanently (auto-temporarily) block IPs with genuinely high risk scores.
      // Simple sliding-window overflow (e.g. a user hammering the login button) is
      // handled by returning 429 — NOT by blacklisting the IP.
      const riskScore = result.riskScore ?? 0;
      if (result.action === "block" && riskScore >= this.BLOCK_THRESHOLD) {
        await blockIp(
          ip,
          `Automated Block: ${pattern.description} (Score: ${riskScore})`,
          false // auto-block = temporary (24h), not permanent
        );
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
      return { allowed: currentCount < limits.baseLimit, count: currentCount, remaining: Math.max(0, limits.baseLimit - currentCount) };
    }
    return this.checkLocalSlidingWindow(id, ep, limits);
  }

  private checkLocalSlidingWindow(id: string, ep: string, limits: AdaptiveLimits) {
    const key = `${id}:${ep}`;
    const now = Date.now();
    const timestamps = (this.localWindow.get(key) || []).filter(t => t > now - limits.windowSize);
    timestamps.push(now);
    this.localWindow.set(key, timestamps);
    return { allowed: timestamps.length <= limits.baseLimit, count: timestamps.length, remaining: Math.max(0, limits.baseLimit - timestamps.length) };
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

  public getStats() {
    return { activeIdentifiers: this.userReputation.size, reputationCacheSize: this.userReputation.size, patternCacheSize: 0 };
  }

  // Internal access for tests (preserved original names for index-access compatibility)
  public calculateRiskScore(id: string, dev?: DeviceInfo, ep?: string): Promise<number> {
    return calculateRiskScore(id, dev, ep);
  }

  public analyzeBehavior(id: string) {
    return analyzeBehavior(id, this.userBehavioralStats);
  }

  public cleanup(): void {
    this.userReputation.clear(); this.userBehavioralStats.clear(); this.localWindow.clear();
  }
}

export const advancedRateLimiter = AdvancedRateLimiter.getInstance();
