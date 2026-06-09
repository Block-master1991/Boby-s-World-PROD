/**
 * Advanced Session Manager - Advanced session management system
 */

import { randomBytes } from "crypto";
import { logger } from "utils/logger";
import redis from "../redis";
import { performSessionChecks, safeCompare } from "./manager-helpers";
import { calculateRiskScore } from "./risk";
import {
  generateAdvancedDeviceFingerprint,
  generateDeviceBindingKey,
  generateHighEntropy,
  generateSecureSessionId,
} from "./security";
import type { DeviceInfo, GeoLocation, SessionData, SessionOptions } from "./types";

// Re-export for backward compatibility
export type { DeviceInfo, GeoLocation, SessionData, SessionOptions };

export class AdvancedSessionManager {
  private static instance: AdvancedSessionManager;
  private readonly DEFAULT_TIMEOUT = 30 * 60; // 30 minutes in seconds
  private readonly MAX_CONCURRENT_SESSIONS = 5;

  // Redis Key Prefixes
  private readonly SESSION_PREFIX = "session:v2:";
  private readonly FINGERPRINT_PREFIX = "fingerprint:v2:";
  private readonly USER_SESSIONS_PREFIX = "user_sessions:v2:";

  private constructor() {}

  public static getInstance(): AdvancedSessionManager {
    if (!AdvancedSessionManager.instance) {
      AdvancedSessionManager.instance = new AdvancedSessionManager();
    }
    return AdvancedSessionManager.instance;
  }

  /** Create new secure session */
  public async createSecureSession(
    userId: string,
    deviceInfo: DeviceInfo,
    options?: SessionOptions
  ): Promise<SessionData | null> {
    try {
      if (!(await this.checkConcurrentSessions(userId, options))) return null;

      const deviceFingerprint = generateAdvancedDeviceFingerprint(deviceInfo);
      const deviceBindingKey = await generateDeviceBindingKey(deviceFingerprint);

      const sessionData = this.buildSessionData(
        userId,
        { fingerprint: deviceFingerprint, bindingKey: deviceBindingKey, deviceInfo },
        options
      );
      await this.persistSession(sessionData, options);

      logger.log(
        `[SessionManager] Secure session created: ${sessionData.sessionId} for user ${userId}`
      );
      return sessionData;
    } catch (error) {
      logger.error(`[SessionManager] Failed to create secure session for user ${userId}:`, error);
      return null;
    }
  }

  private async checkConcurrentSessions(
    userId: string,
    options?: SessionOptions
  ): Promise<boolean> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const activeCount = await redis.scard(userSessionsKey);
    if (activeCount >= (options?.maxConcurrentSessions || this.MAX_CONCURRENT_SESSIONS)) {
      logger.warn(`[SessionManager] Maximum sessions limit exceeded for user ${userId}`);
      return false;
    }
    return true;
  }

  private buildSessionData(
    userId: string,
    context: { fingerprint: string; bindingKey: string; deviceInfo: DeviceInfo },
    options?: SessionOptions
  ): SessionData {
    const now = Date.now();
    const timeoutSeconds = (options?.timeoutMinutes || 30) * 60;

    return {
      sessionId: generateSecureSessionId(),
      userId,
      deviceFingerprint: context.fingerprint,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: now + timeoutSeconds * 1000,
      securityContext: {
        entropy: generateHighEntropy(),
        deviceBindingKey: context.bindingKey,
        challenge: randomBytes(32).toString("hex"),
        proof: randomBytes(32).toString("hex"),
      },
      riskScore: calculateRiskScore(context.deviceInfo),
      currentSeed: randomBytes(16).toString("hex"),
      seedExpiresAt: now + 30000,
      isActive: true,
      authMethod: options?.authMethod || "wallet",
      credentialId: options?.credentialId,
    };
  }

  private async persistSession(session: SessionData, options?: SessionOptions): Promise<void> {
    const timeoutSeconds = (options?.timeoutMinutes || 30) * 60;
    const sessionKey = `${this.SESSION_PREFIX}${session.sessionId}`;
    const fingerprintKey = `${this.FINGERPRINT_PREFIX}${session.deviceFingerprint}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${session.userId}`;

    await redis
      .multi()
      .setex(sessionKey, timeoutSeconds, JSON.stringify(session))
      .sadd(userSessionsKey, session.sessionId)
      .sadd(fingerprintKey, session.sessionId)
      .expire(userSessionsKey, timeoutSeconds + 3600)
      .expire(fingerprintKey, timeoutSeconds + 3600)
      .exec();
  }

  /** Validate session and bind to device */
  public async validateSession(
    sessionId: string,
    deviceInfo: DeviceInfo,
    _currentIp: string, // Unused param
    currentLocation?: GeoLocation
  ): Promise<{ valid: boolean; session?: SessionData; reason?: string }> {
    try {
      const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
      const sessionStr = await redis.get(sessionKey);
      if (!sessionStr) return { valid: false, reason: "Session not found or expired" };

      const session: SessionData = JSON.parse(sessionStr);
      if (!session.isActive) return { valid: false, reason: "Session terminated" };
      if (session.expiresAt < Date.now()) {
        await this.expireSession(sessionId);
        return { valid: false, reason: "Session expired" };
      }

      const result = await performSessionChecks({
        session,
        deviceInfo,
        expireSession: this.expireSession.bind(this),
        updateFingerprintMapping: this.updateFingerprintMapping.bind(this),
        loc: currentLocation,
      });
      if (!result.valid) return result;

      // Updated activity and save
      session.lastActivityAt = Date.now();
      session.expiresAt = Date.now() + this.DEFAULT_TIMEOUT * 1000;
      await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));

      return { valid: true, session };
    } catch (error) {
      logger.error(`[SessionManager] Error validating session ${sessionId}:`, error);
      return { valid: false, reason: "Validation error" };
    }
  }

  private async updateFingerprintMapping(
    sessionId: string,
    oldF: string,
    newF: string
  ): Promise<void> {
    const oldKey = `${this.FINGERPRINT_PREFIX}${oldF}`;
    const newKey = `${this.FINGERPRINT_PREFIX}${newF}`;
    await redis
      .multi()
      .srem(oldKey, sessionId)
      .sadd(newKey, sessionId)
      .expire(newKey, this.DEFAULT_TIMEOUT)
      .exec();
  }

  /** Validate session seed and rotate it */
  public async validateAndRotateSeed(
    sessionId: string,
    providedSeed: string
  ): Promise<{ valid: boolean; nextSeed?: string; error?: string }> {
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const sessionStr = await redis.get(sessionKey);
    if (!sessionStr) return { valid: false, error: "Invalid session" };
    const session: SessionData = JSON.parse(sessionStr);

    if (safeCompare(session.currentSeed, providedSeed)) {
      const nextSeed = randomBytes(16).toString("hex");
      session.previousSeed = session.currentSeed;
      session.currentSeed = nextSeed;
      session.seedExpiresAt = Date.now();
      await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));
      return { valid: true, nextSeed };
    }

    if (
      session.previousSeed &&
      safeCompare(session.previousSeed, providedSeed) &&
      Date.now() - session.seedExpiresAt < 30000
    ) {
      return { valid: true, nextSeed: session.currentSeed };
    }

    session.riskScore += 10;
    await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));
    return { valid: false, error: "Invalid or expired session seed" };
  }

  /** Expire session */
  public async expireSession(sessionId: string): Promise<boolean> {
    try {
      const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
      const sessionStr = await redis.get(sessionKey);
      if (sessionStr) {
        const session: SessionData = JSON.parse(sessionStr);
        await redis
          .multi()
          .del(sessionKey)
          .srem(`${this.USER_SESSIONS_PREFIX}${session.userId}`, sessionId)
          .srem(`${this.FINGERPRINT_PREFIX}${session.deviceFingerprint}`, sessionId)
          .exec();
        logger.log(`[SessionManager] Session expired: ${sessionId}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`[SessionManager] Error expiring session ${sessionId}:`, error);
      return false;
    }
  }

  /** Expire all user sessions */
  public async expireAllUserSessions(userId: string): Promise<number> {
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    const sessionIds = await redis.smembers(userSessionsKey);

    const results = await Promise.all(sessionIds.map(id => this.expireSession(id)));
    const expiredCount = results.filter(Boolean).length;

    await redis.del(userSessionsKey);
    logger.log(`[SessionManager] Expired ${expiredCount} sessions for user ${userId}`);
    return expiredCount;
  }

  /** Session statistics */
  public async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
  }> {
    const dbSize = await redis.dbsize();
    return {
      totalSessions: dbSize,
      activeSessions: dbSize,
    };
  }

  /** Clear all sessions (for testing) */
  public async cleanup(): Promise<void> {
    if (redis) {
      const keys = await redis.keys(`${this.SESSION_PREFIX}*`);
      const userKeys = await redis.keys(`${this.USER_SESSIONS_PREFIX}*`);
      const fingerprintKeys = await redis.keys(`${this.FINGERPRINT_PREFIX}*`);
      const allKeys = [...keys, ...userKeys, ...fingerprintKeys];
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
    }
  }
}

export const sessionManager = AdvancedSessionManager.getInstance();
