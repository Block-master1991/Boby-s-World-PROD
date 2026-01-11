/**
 * Advanced Rate Limiter - Intelligent and advanced rate limiting system
 * Provides protection from all types of attacks with adaptive limits
 */

import redis from './redis';
import { getClientIp } from './request-utils';
import { isIpInList, blockIp } from './ip-list';
import type { DeviceInfo } from './advancedSessionManager';
import { securityLogger, SecurityEventLevel } from './securityLogger';
import { logger } from 'utils/logger';

/**
 * Filtering and sanitizing User-Agent to prevent simple bots
 */
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

// DeviceInfo is now imported from advancedSessionManager for consistency

export interface RateLimitResult {
    allowed: boolean;
    retryAfter?: number;
    currentCount?: number;
    limit?: number;
    remaining?: number;
    riskScore?: number;
    action?: 'allow' | 'warn' | 'block' | 'challenge';
}

export interface AdaptiveLimits {
    baseLimit: number;
    burstLimit: number;
    windowSize: number;
    reputationMultiplier: number;
    riskAdjustment: number;
}

export interface SuspiciousActivity {
    type: 'rapid_requests' | 'unusual_pattern' | 'bot_signature' | 'ddos_attempt' | 'geographic_anomaly' | 'blacklisted_ip';
    severity: 'low' | 'medium' | 'high' | 'critical';
    score: number;
    description: string;
    evidence: any;
}

export class AdvancedRateLimiter {
    private static instance: AdvancedRateLimiter;
    private readonly BASE_LIMIT = 150; // Request per minute for regular user (Increased for smoother gameplay)
    private readonly SLIDING_WINDOW = 60000; // 1 minute
    private readonly BURST_WINDOW = 10000; // 10 seconds for consecutive requests
    private readonly MAX_BURST = 30; // Maximum 30 requests in 10 seconds (Increased to allow rapid game actions)
    private readonly REPUTATION_DECAY = 0.95; // Reputation decay rate
    private readonly CHALLENGE_THRESHOLD = 70; // Challenge activation threshold
    private readonly BLOCK_THRESHOLD = 90; // Complete blocking threshold

    // Temporary storage for data that doesn't need Redis
    private userReputation = new Map<string, { score: number; lastActivity: number }>();
    private requestPatterns = new Map<string, { timestamps: number[]; endpoint: string }>();
    private userBehavioralStats = new Map<string, {
        avgFrequency: number;
        requestCount: number;
        lastRequestTime: number;
        deviationScore: number
    }>();

    private constructor() {
        this.initializeCleanup();
    }

    public static getInstance(): AdvancedRateLimiter {
        if (!AdvancedRateLimiter.instance) {
            AdvancedRateLimiter.instance = new AdvancedRateLimiter();
        }
        return AdvancedRateLimiter.instance;
    }

    /**
     * Initialize cleanup of temporary data
     */
    private initializeCleanup(): void {
        // Clean temporary data every 30 minutes
        setInterval(() => {
            const now = Date.now();
            // Clean expired reputation
            for (const [identifier, data] of this.userReputation) {
                if (now - data.lastActivity > 3600000) { // 1 hour
                    this.userReputation.delete(identifier);
                }
            }

            // Clean expired patterns
            for (const [identifier, data] of this.requestPatterns) {
                if (data.timestamps.length > 0 && now - data.timestamps[data.timestamps.length - 1] > 3600000) {
                    this.requestPatterns.delete(identifier);
                }
            }

            // Clean behavioral data (every 2 hours of inactivity)
            for (const [identifier, stats] of this.userBehavioralStats) {
                if (now - stats.lastRequestTime > 7200000) {
                    this.userBehavioralStats.delete(identifier);
                }
            }
        }, 1800000); // 30 minutes
    }

    /**
     * Convert score to severity level
     */
    private getSeverityFromScore(score: number): SuspiciousActivity['severity'] {
        if (score >= 80) return 'critical';
        if (score >= 60) return 'high';
        if (score >= 40) return 'medium';
        return 'low';
    }

    /**
     * Log suspicious activity
     */
    private async logSuspiciousActivity(
        ip: string,
        endpoint: string,
        activity: SuspiciousActivity
    ): Promise<void> {
        try {
            // Log in central SIEM
            await securityLogger.logEvent({
                type: activity.type,
                level: activity.severity === 'critical' ? SecurityEventLevel.CRITICAL : SecurityEventLevel.WARN,
                message: activity.description,
                ip,
                endpoint,
                evidence: activity.evidence
            });

            // Log in Redis for quick display
            const logData = { ...activity, ip, endpoint, timestamp: Date.now() };
            await redis.lpush('suspicious_activity', JSON.stringify(logData));
            await redis.ltrim('suspicious_activity', 0, 99);
            await redis.expire('suspicious_activity', 86400);

            // Log in console for monitoring
            logger.warn('[AdvancedRateLimiter] Suspicious activity:', logData);
        } catch (error) {
            logger.error('[AdvancedRateLimiter] Error logging suspicious activity:', error);
        }
    }

    /**
     * Check Rate Limit with Sliding Window algorithm
     */
    public async checkRateLimit(
        request: Request,
        identifier: string,
        endpoint: string,
        deviceInfo?: DeviceInfo,
        options?: { customLimit?: number; bypassMode?: boolean }
    ): Promise<RateLimitResult> {
        try {
            const ip = getClientIp(request);

            // Bypass rate limiting for localhost in development
            if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
                return { allowed: true, action: 'allow' };
            }

            const userAgent = sanitizeUserAgent(request.headers.get('user-agent'));

            // Enhance identifier by combining IP and sanitized User-Agent
            const enhancedIdentifier = `${identifier}:${ip}:${userAgent}`;

            // Increment Total Requests Counter (Fire & Forget)
            if (redis) {
                redis.incr('stats:total_requests').catch(() => { });
            }

            // Check whitelist
            if (await isIpInList('whitelist', ip)) {
                return { allowed: true, action: 'allow' };
            }

            // Check blacklist
            if (await isIpInList('blacklist', ip)) {
                if (redis) redis.incr('stats:blocked_requests').catch(() => { });

                await this.logSuspiciousActivity(ip, endpoint, {
                    type: 'blacklisted_ip',
                    severity: 'critical',
                    score: 100,
                    description: 'Attempted access from blocked IP listed in blacklist',
                    evidence: {
                        ip,
                        reason: 'IP found in blacklisted pool',
                        timestamp: new Date().toISOString()
                    }
                });

                return {
                    allowed: false,
                    retryAfter: 3600,
                    action: 'block'
                };
            }

            // Check emergency mode (Panic Mode)
            let isPanicMode = false;
            if (redis) {
                const panic = await redis.get('security:panic_mode');
                isPanicMode = panic === '1';
            }

            // Calculate reputation and risks
            const reputation = await this.calculateUserReputation(identifier, deviceInfo);
            let riskScore = await this.calculateRiskScore(identifier, deviceInfo, endpoint);

            // Apply emergency mode effects
            if (isPanicMode) {
                riskScore += 50; // Increase risk immediately for everyone
            }

            // Determine adaptive limits
            const adaptiveLimits = this.calculateAdaptiveLimits(reputation, riskScore);

            if (isPanicMode) {
                // Reduce limits by 80% in emergency mode
                adaptiveLimits.baseLimit = Math.max(1, Math.floor(adaptiveLimits.baseLimit * 0.2));
                adaptiveLimits.burstLimit = Math.max(1, Math.floor(adaptiveLimits.burstLimit * 0.2));
            }

            // Wrap Redis-dependent calls with a timeout to prevent absolute hangs
            const redisPromise = Promise.all([
                this.checkSlidingWindow(identifier, endpoint, adaptiveLimits),
                this.checkBurstPattern(identifier, endpoint),
                this.analyzeRequestPatterns(identifier, endpoint, request)
            ]);

            // Timeout after 1 second - if Redis is slow, we allow the request in development
            const timeoutPromise = new Promise<{ allowed: boolean; count: number; remaining: number }[] | null>((resolve) =>
                setTimeout(() => resolve(null), 1000)
            );

            const results = await Promise.race([redisPromise, timeoutPromise]) as any;

            let slidingResult, burstResult, patternAnalysis;

            if (results) {
                [slidingResult, burstResult, patternAnalysis] = results;
            } else {
                // Fallback for Redis hang/failure -> Use Local Memory
                logger.warn(`[AdvancedRateLimiter] Redis timed out for ${identifier}. Switching to In-Memory Fallback.`);
                slidingResult = this.checkLocalSlidingWindow(identifier, endpoint, adaptiveLimits);
                burstResult = { allowed: true, burstCount: 0 }; // Burst is harder to track locally without shared state, ignore for now
                patternAnalysis = { type: 'rapid_requests', description: 'Redis fallback active', evidence: null, score: 0 };
            }

            // Analyze behavior (Behavioral AI) - Independent of Redis
            const behavioralRisk = this.analyzeBehavior(identifier);

            // Merge results and make decision
            const finalResult = this.synthesizeResults(
                slidingResult,
                burstResult,
                patternAnalysis,
                reputation,
                riskScore + behavioralRisk, // Merge behavioral deviation risk
                adaptiveLimits
            );

            // Log activity if suspicious
            if (finalResult.action === 'warn' || finalResult.action === 'block' || finalResult.action === 'challenge') {
                try {
                    await this.logSuspiciousActivity(ip, endpoint, {
                        type: patternAnalysis.type,
                        severity: this.getSeverityFromScore(finalResult.riskScore || 0),
                        score: finalResult.riskScore || 0,
                        description: patternAnalysis.description,
                        evidence: patternAnalysis.evidence
                    });
                } catch (e) { /* ignore logging error */ }

                // If decision is block, activate permanent blocking
                if (finalResult.action === 'block') {
                    try {
                        await blockIp(ip, `Automated Block: ${patternAnalysis.description} (Score: ${finalResult.riskScore})`);
                    } catch (e) {
                        logger.error('[RateLimit] Failed to block IP persistently:', e);
                    }
                }
            }

            return finalResult;

        } catch (error) {
            logger.error('[AdvancedRateLimiter] Error in rate limit check:', error);
            // In case of error, allow request but send warning
            return { allowed: true, action: 'warn' };
        }
    }

    // Local fallback for sliding window
    private localWindow = new Map<string, number[]>();

    /**
     * Implement Sliding Window locally (In-Memory)
     */
    private checkLocalSlidingWindow(
        identifier: string,
        endpoint: string,
        limits: AdaptiveLimits
    ): { allowed: boolean; count: number; remaining: number } {
        const key = `sliding:${identifier}:${endpoint}`;
        const now = Date.now();
        const windowStart = now - limits.windowSize;

        if (!this.localWindow.has(key)) {
            this.localWindow.set(key, []);
        }

        const timestamps = this.localWindow.get(key)!;

        // Filter old timestamps
        const validTimestamps = timestamps.filter(t => t > windowStart);
        validTimestamps.push(now);

        this.localWindow.set(key, validTimestamps);

        const currentCount = validTimestamps.length;
        const allowed = currentCount <= limits.baseLimit;
        const remaining = Math.max(0, limits.baseLimit - currentCount);

        // Cleanup occasionally
        if (Math.random() < 0.01) {
            for (const [k, ts] of this.localWindow) {
                const fresh = ts.filter(t => t > Date.now() - limits.windowSize);
                if (fresh.length === 0) this.localWindow.delete(k);
                else this.localWindow.set(k, fresh);
            }
        }

        return { allowed, count: currentCount, remaining };
    }

    /**
     * Check Sliding Window Algorithm
     */
    private async checkSlidingWindow(
        identifier: string,
        endpoint: string,
        limits: AdaptiveLimits
    ): Promise<{ allowed: boolean; count: number; remaining: number }> {
        const key = `sliding:${identifier}:${endpoint}`;
        const now = Date.now();
        const windowStart = now - limits.windowSize;

        try {
            // Attempt Redis Operation
            if (redis) {
                // Remove old requests from the window
                await redis.zremrangebyscore(key, 0, windowStart);

                // Count requests in the current window
                const countResult = await redis.zcard(key);

                // If Redis returns null (silent failure mode), throw to trigger fallback
                if (countResult === null) throw new Error('Redis silent failure');

                const currentCount = countResult as number;

                // Add current request
                await redis.zadd(key, now, `${now}:${Math.random()}`);
                await redis.expire(key, Math.ceil(limits.windowSize / 1000));

                const allowed = currentCount < limits.baseLimit;
                const remaining = Math.max(0, limits.baseLimit - currentCount);

                return { allowed, count: currentCount, remaining };
            }
            throw new Error('Redis not initialized');
        } catch (error) {
            // Fallback to In-Memory
            return this.checkLocalSlidingWindow(identifier, endpoint, limits);
        }
    }

    /**
     * Check consecutive Bursts patterns
     */
    private async checkBurstPattern(
        identifier: string,
        endpoint: string
    ): Promise<{ allowed: boolean; burstCount: number }> {
        const key = `burst:${identifier}:${endpoint}`;
        const now = Date.now();

        try {
            const burstCount = await redis.zcard(key);

            if (burstCount >= this.MAX_BURST) {
                // Detect suspicious burst
                await redis.zadd(key, now, `burst:${now}`);
                await redis.expire(key, 300); // 5 minutes

                return { allowed: false, burstCount };
            }

            // Add request for burst tracking
            await redis.zadd(key, now, `request:${now}:${Math.random()}`);
            await redis.expire(key, 300);

            return { allowed: true, burstCount };
        } catch (error) {
            logger.error('[AdvancedRateLimiter] Error in checking Bursts:', error);
            return { allowed: true, burstCount: 0 };
        }
    }

    /**
     * Calculate user reputation
     */
    private async calculateUserReputation(identifier: string, deviceInfo?: DeviceInfo): Promise<number> {
        try {
            const reputationKey = `reputation:${identifier}`;
            const existing = await redis.get(reputationKey);

            let score = existing ? parseInt(existing) : 100; // Default reputation

            // Update reputation based on device info
            if (deviceInfo) {
                // Reward for known devices
                if (deviceInfo.plugins.length > 0) {
                    score += 5; // Real browser
                }

                // Reward for reasonable timezone
                const reasonableTimezone = ['UTC', 'GMT', 'EST', 'PST', 'CET', 'EET'];
                if (reasonableTimezone.some(tz => deviceInfo.timezone.includes(tz))) {
                    score += 3;
                }

                // Penalty for suspicious user-agent
                if (deviceInfo.userAgent.includes('bot') ||
                    deviceInfo.userAgent.includes('crawler') ||
                    deviceInfo.userAgent.includes('python')) {
                    score -= 20;
                }
            }

            // Apply reputation decay
            score = Math.max(0, Math.min(100, score * this.REPUTATION_DECAY));

            // Save reputation
            await redis.setex(reputationKey, 3600, score.toString());

            return score;
        } catch (error) {
            logger.error('[AdvancedRateLimiter] Error in calculating reputation:', error);
            return 50; // Medium reputation in case of error
        }
    }

    /**
     * Calculate risk level
     */
    private async calculateRiskScore(
        identifier: string,
        deviceInfo?: DeviceInfo,
        endpoint?: string
    ): Promise<number> {
        let riskScore = 0;

        // Check device information
        if (deviceInfo) {
            // Check unreasonable screen resolution
            if (deviceInfo.screenResolution) {
                const [width, height] = deviceInfo.screenResolution.split('x').map(Number);
                if (width < 400 || height < 400 || width > 8000 || height > 6000) {
                    riskScore += 15;
                }
            }

            // Check unreasonable hardware concurrency
            if (deviceInfo.hardwareConcurrency && (deviceInfo.hardwareConcurrency < 1 || deviceInfo.hardwareConcurrency > 64)) {
                riskScore += 10;
            }

            // Check empty plugins
            if (deviceInfo.plugins.length === 0) {
                riskScore += 20; // May be headless browser
            }

            // Check unknown timezone
            if (!deviceInfo.timezone || deviceInfo.timezone.length === 0) {
                riskScore += 10;
            }
        }

        // Check sensitive endpoint
        if (endpoint) {
            const sensitiveEndpoints = ['/api/auth', '/api/admin', '/api/crypto'];
            if (sensitiveEndpoints.some(ep => endpoint.includes(ep))) {
                riskScore += 5;
            }
        }

        // Check request patterns
        const patternKey = `pattern:${identifier}`;
        try {
            if (redis) {
                const recentPatterns = await redis.get(patternKey);
                if (recentPatterns) {
                    const patterns = JSON.parse(recentPatterns);
                    if (patterns.tooManyEndpoints) {
                        riskScore += 15;
                    }
                    if (patterns.rapidSwitches) {
                        riskScore += 10;
                    }
                }
            }
        } catch (e) {
            // Ignore redis error in risk score calculation
        }

        return Math.min(riskScore, 100);
    }

    /**
     * Analyze request patterns
     */
    private async analyzeRequestPatterns(
        identifier: string,
        endpoint: string,
        request: Request
    ): Promise<{
        type: SuspiciousActivity['type'];
        description: string;
        evidence: any;
        score: number;
    }> {
        const patternKey = `patterns:${identifier}`;

        try {
            // Get current patterns
            let patterns = await redis.get(patternKey);
            if (!patterns) {
                patterns = JSON.stringify({
                    endpoints: {},
                    timestamps: [],
                    userAgent: request.headers.get('user-agent') || '',
                    lastUpdate: Date.now()
                });
            }

            const patternData = JSON.parse(patterns);
            const now = Date.now();

            // Update patterns
            if (!patternData.endpoints[endpoint]) {
                patternData.endpoints[endpoint] = [];
            }

            patternData.endpoints[endpoint].push(now);

            // Remove old requests (more than an hour)
            const hourAgo = now - 3600000;
            for (const ep in patternData.endpoints) {
                patternData.endpoints[ep] = patternData.endpoints[ep].filter((t: number) => t > hourAgo);
            }

            // Analyze patterns
            let suspiciousType: SuspiciousActivity['type'] = 'rapid_requests';
            let description = '';
            let score = 0;

            // Check rapid endpoint changes
            const uniqueEndpoints = Object.keys(patternData.endpoints).length;
            const hasHighEndpointCount = Object.values(patternData.endpoints).some((arr: unknown) => Array.isArray(arr) && arr.length > 20);
            if (uniqueEndpoints > 10 && hasHighEndpointCount) {
                suspiciousType = 'unusual_pattern';
                description = 'Multiple endpoint reconnaissance attempt';
                score = 25;
            }

            // Check very fast consecutive requests
            const allRequests = Object.values(patternData.endpoints).flat() as number[];
            const rapidRequests = allRequests.filter((t: number) => now - t < 5000); // 5 seconds
            if (rapidRequests.length > 5) {
                suspiciousType = 'rapid_requests';
                description = 'Very fast consecutive requests';
                score = 20;
            }

            // Check different user-agent
            const currentUA = request.headers.get('user-agent') || '';
            if (patternData.userAgent && patternData.userAgent !== currentUA) {
                suspiciousType = 'bot_signature';
                description = 'Suspicious User-Agent change';
                score = 30;
            }

            // Save updated patterns
            patternData.lastUpdate = now;
            await redis.setex(patternKey, 3600, JSON.stringify(patternData));

            return {
                type: suspiciousType,
                description,
                evidence: patternData,
                score
            };
        } catch (error) {
            logger.error('[AdvancedRateLimiter] Error in pattern analysis:', error);
            return {
                type: 'rapid_requests',
                description: 'Error in pattern analysis',
                evidence: null,
                score: 0
            };
        }
    }

    /**
     * Adaptive behavioral analysis (Behavioral AI)
     * Learns "normal speed" for the user and detects deviations
     */
    private analyzeBehavior(identifier: string): number {
        const now = Date.now();
        let stats = this.userBehavioralStats.get(identifier);

        if (!stats) {
            stats = { avgFrequency: 0, requestCount: 0, lastRequestTime: now, deviationScore: 0 };
        }

        const timeSinceLastRequest = now - stats.lastRequestTime;
        stats.requestCount++;

        if (stats.requestCount > 10) { // Learning phase (first 10 requests)
            // Calculate average frequency (Exponential Moving Average)
            const alpha = 0.1; // Learning speed
            // If time is zero (synchronized requests), consider it very high frequency (2000 req/sec) to ensure burst detection
            const currentFrequency = timeSinceLastRequest > 0 ? 1000 / timeSinceLastRequest : 2000;

            if (stats.avgFrequency > 0) {
                const deviation = Math.abs(currentFrequency - stats.avgFrequency) / stats.avgFrequency;

                // If frequency deviates more than 3 times the user's normal average
                if (deviation > 3 && currentFrequency > 5) {
                    stats.deviationScore = Math.min(100, stats.deviationScore + 25);
                } else {
                    stats.deviationScore = Math.max(0, stats.deviationScore - 2);
                }
            }

            stats.avgFrequency = (alpha * currentFrequency) + (1 - alpha) * stats.avgFrequency;
        } else {
            // Initial learning period
            const currentFreq = timeSinceLastRequest > 0 ? 1000 / timeSinceLastRequest : 500;
            stats.avgFrequency = stats.requestCount === 1 ? currentFreq : (stats.avgFrequency + currentFreq) / 2;
        }

        stats.lastRequestTime = now;
        this.userBehavioralStats.set(identifier, stats);

        return stats.deviationScore;
    }

    /**
     * Calculate adaptive limits
     */
    private calculateAdaptiveLimits(reputation: number, riskScore: number): AdaptiveLimits {
        const reputationMultiplier = reputation / 100; // 0.0 to 1.0
        const riskPenalty = Math.max(0, (riskScore - 50) / 50); // 0.0 to 1.0

        return {
            baseLimit: Math.floor(this.BASE_LIMIT * reputationMultiplier),
            burstLimit: Math.floor(this.MAX_BURST * reputationMultiplier),
            windowSize: this.SLIDING_WINDOW,
            reputationMultiplier,
            riskAdjustment: riskPenalty
        };
    }

    /**
     * Merge check results and make final decision
     */
    private synthesizeResults(
        sliding: { allowed: boolean; count: number; remaining: number },
        burst: { allowed: boolean; burstCount: number },
        pattern: { type: SuspiciousActivity['type']; score: number; description: string },
        reputation: number,
        riskScore: number,
        limits: AdaptiveLimits
    ): RateLimitResult {
        const combinedRiskScore = Math.min(100, riskScore + pattern.score);

        let action: RateLimitResult['action'] = 'allow';
        let allowed = true;
        let retryAfter: number | undefined;

        // Decisions based on risk level
        if (combinedRiskScore >= this.BLOCK_THRESHOLD) {
            action = 'block';
            allowed = false;
            retryAfter = 3600; // One hour
        } else if (combinedRiskScore >= this.CHALLENGE_THRESHOLD) {
            action = 'challenge';
            allowed = false;
            retryAfter = 300; // 5 minutes
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
            riskScore: combinedRiskScore
        };
    }

    /**
     * Rate Limiter statistics
     */
    public getStats(): {
        activeIdentifiers: number;
        reputationCacheSize: number;
        patternCacheSize: number;
    } {
        return {
            activeIdentifiers: this.userReputation.size, // Approximate
            reputationCacheSize: this.userReputation.size,
            patternCacheSize: this.requestPatterns.size
        };
    }

    /**
     * Clean up resources
     */
    public cleanup(): void {
        this.userReputation.clear();
        this.requestPatterns.clear();
    }
}

// Export singleton instance
export const advancedRateLimiter = AdvancedRateLimiter.getInstance();
