/**
 * Security Integration - Advanced security systems integration
 * Connects all security systems together in a unified interface
 */
import { webcrypto } from "node:crypto";
import { logger } from "utils/logger";
import { keyVault } from "../key-vault/keyVaultService";
import { AdvancedRateLimiter, type RateLimitResult } from "../ratelimit/advancedRateLimiter";
import { sessionManager, type DeviceInfo, type SessionData } from "../session/advancedSessionManager";
import type { AuthenticationResult, SecurityContext, SecurityStats } from "./securityTypes";
// Lazy getter — resolved at call time, not import time.
// This ensures Jest mocks applied in setupFiles are visible before first use.
const getCrypto = (): Crypto => {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    return globalThis.crypto as Crypto;
  }
  return webcrypto as unknown as Crypto;
};

export class SecurityIntegration {
  private static instance: SecurityIntegration;

  private constructor() {}

  public static getInstance(): SecurityIntegration {
    if (!SecurityIntegration.instance) {
      SecurityIntegration.instance = new SecurityIntegration();
    }
    return SecurityIntegration.instance;
  }
  /**
   * Comprehensive authentication with all security layers
   */
  public async authenticateRequest(
    request: Request,
    userId: string,
    endpoint: string,
    deviceInfo?: DeviceInfo
  ): Promise<AuthenticationResult> {
    try {
      // 1. Check Rate Limiting
      const rateLimitResult = await this.checkRateLimit(request, userId, endpoint, deviceInfo);
      if (!rateLimitResult.allowed) {
        return this.createRateLimitError(rateLimitResult);
      }
      // 2. Establish Secure Session
      const session = await this.establishSession(request, userId, deviceInfo);
      if (!session) {
        return {
          success: false,
          error: "Failed to create secure session",
          requiresChallenge: true,
        };
      }
      // 3. Create Security Context
      return {
        success: true,
        session: this.createSecurityContext(session),
        rateLimitInfo: rateLimitResult,
      };
    } catch (error) {
      logger.error("[SecurityIntegration] Authentication error:", error);
      return { success: false, error: "Security system error" };
    }
  }

  /**
   * Validate session on every request
   */
  public async validateSession(
    sessionId: string,
    request: Request,
    deviceInfo?: DeviceInfo
  ): Promise<{ valid: boolean; session?: SecurityContext; error?: string; isInfraError?: boolean }> {
    try {
      const device = deviceInfo || this.extractDeviceInfo(request);
      const validation = await sessionManager.validateSession(
        sessionId,
        device,
        request.headers.get("x-forwarded-for") || "unknown",
        undefined // Geographic location can be added later
      );

      if (!validation.valid || !validation.session) {
        return {
          valid: false,
          error: validation.reason || "Invalid session",
          // Coerce to boolean: validation.isInfraError may be undefined when
          // the session was simply not found (not an infra failure).
          isInfraError: !!validation.isInfraError,
        };
      }

      return {
        valid: true,
        session: this.createSecurityContext(validation.session),
      };
    } catch (error) {
      logger.error("[SecurityIntegration] Session validation error:", error);
      return { valid: false, error: "Session validation error", isInfraError: true };
    }
  }

  /**
   * Validate session seed and rotate it
   */
  public async validateAndRotateSeed(
    sessionId: string,
    providedSeed: string
  ): Promise<{ valid: boolean; nextSeed?: string; error?: string }> {
    // Explicit await to satisfy require-await lint without conflicting with no-return-await
    const result = await sessionManager.validateAndRotateSeed(sessionId, providedSeed);
    return result;
  }

  /**
   * Encrypt data using secure keys
   */
  public async encryptData(data: string, keyId: string = "default"): Promise<string> {
    try {
      let key = await keyVault.getSecureKey(keyId);
      if (!key) {
        await this.createSecureKey(keyId);
        key = await keyVault.getSecureKey(keyId);
        if (!key) throw new Error(`Failed to create and retrieve key: ${keyId}`);
      }

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const crypto = getCrypto();
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, dataBuffer);

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);

      return Buffer.from(combined).toString("base64");
    } catch (error) {
      logger.error("[SecurityIntegration] Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Decrypt data
   */
  public async decryptData(encryptedData: string, keyId: string = "default"): Promise<string> {
    try {
      const key = await keyVault.getSecureKey(keyId);
      if (!key) throw new Error(`Key not available: ${keyId}`);

      const combined = Buffer.from(encryptedData, "base64");
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await getCrypto().subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      logger.error("[SecurityIntegration] Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }

  // --- Helper Methods to reduce complexity ---

  private async checkRateLimit(
    request: Request,
    userId: string,
    endpoint: string,
    deviceInfo?: DeviceInfo
  ): Promise<RateLimitResult> {
    const result = await AdvancedRateLimiter.getInstance().checkRateLimit(request, userId, {
      endpoint,
      deviceInfo,
    });
    return result;
  }

  private createRateLimitError(result: RateLimitResult): AuthenticationResult {
    return {
      success: false,
      error: "Request limit exceeded",
      rateLimitInfo: {
        allowed: false,
        retryAfter: result.retryAfter,
        remaining: result.remaining,
      },
    };
  }

  private async establishSession(
    request: Request,
    userId: string,
    deviceInfo?: DeviceInfo
  ): Promise<SessionData | null> {
    const session = await sessionManager.createSecureSession(
      userId,
      deviceInfo || this.extractDeviceInfo(request),
      {
        timeoutMinutes: 30,
        enableDeviceFingerprinting: true,
        enableRiskScoring: true,
      }
    );
    return session;
  }

  private createSecurityContext(session: SessionData): SecurityContext {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      deviceFingerprint: session.deviceFingerprint,
      riskScore: session.riskScore,
      securityLevel: this.calculateSecurityLevel(session.riskScore),
      authMethod: session.authMethod,
    };
  }

  // --- Utility Methods ---

  public async terminateSession(sessionId: string): Promise<boolean> {
    const result = await sessionManager.expireSession(sessionId);
    return result;
  }

  public async terminateAllUserSessions(userId: string): Promise<number> {
    const result = await sessionManager.expireAllUserSessions(userId);
    return result;
  }

  public extractDeviceInfo(request: Request): DeviceInfo {
    // On the server we only have access to HTTP headers; browser-only properties
    // (canvas, WebGL, fonts, audio) are unavailable.  We use stable sentinel
    // values so the fingerprint stays consistent across all server-side calls
    // for the same user-agent — preventing spurious riskScore accumulation.
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Read device hints forwarded by the client (if any); fall back to safe defaults.
    const screenRes = request.headers.get("x-screen-resolution") || "server-inferred";
    const hwConcurrency = parseInt(request.headers.get("x-hw-concurrency") || "4", 10);
    const deviceMemory = parseInt(request.headers.get("x-device-memory") || "4", 10);
    const touchPoints = parseInt(request.headers.get("x-touch-points") || "0", 10);
    const platform = request.headers.get("x-platform") || "server-inferred";
    const language = request.headers.get("accept-language")?.split(",")[0] || "en-US";

    return {
      userAgent,
      screenResolution: screenRes,
      hardwareConcurrency: isNaN(hwConcurrency) ? 4 : hwConcurrency,
      deviceMemory: isNaN(deviceMemory) ? 4 : deviceMemory,
      touchPoints: isNaN(touchPoints) ? 0 : touchPoints,
      platform,
      language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      colorDepth: 24, // stable sentinel — not available server-side
      // These fields are browser-only; sentinel values keep the fingerprint stable.
      plugins: ["server-inferred"],
      canvas: "server-inferred",
      webgl: "server-inferred",
      fonts: ["server-inferred"],
      audioContext: "server-inferred",
      battery: "server-inferred",
      networkInfo: "server-inferred",
    };
  }

  private calculateSecurityLevel(riskScore: number): SecurityContext["securityLevel"] {
    if (riskScore >= 90) return "critical";
    if (riskScore >= 70) return "high";
    if (riskScore >= 40) return "medium";
    return "low";
  }

  public async createSecureKey(keyId: string): Promise<boolean> {
    try {
      await keyVault.createSecureKey(
        keyId,
        { name: "AES-GCM", length: 256 },
        {
          autoRotate: true,
          rotationIntervalHours: 24,
          notifyBeforeExpiry: 1,
        }
      );
      return true;
    } catch (error) {
      logger.error("[SecurityIntegration] Key creation error:", error);
      return false;
    }
  }

  public async getSecurityStats(): Promise<SecurityStats> {
    const sessionStats = await sessionManager.getSessionStats();
    return {
      keyVault: keyVault.getStats(),
      sessions: {
        ...sessionStats,
        uniqueDevices: sessionStats.totalSessions,
        expiredSessions: 0,
      },
      rateLimiting: AdvancedRateLimiter.getInstance().getStats(),
    };
  }

  public async cleanup(): Promise<void> {
    keyVault.cleanup();
    AdvancedRateLimiter.getInstance().cleanup();
    await sessionManager.cleanup();
    logger.log("[SecurityIntegration] All security systems cleaned");
  }
}

export const securityIntegration = SecurityIntegration.getInstance();
