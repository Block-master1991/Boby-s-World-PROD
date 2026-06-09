/**
 * Account Recovery Service
 * Centralized logic for account recovery processes
 */

import type { AuditEventMetadata } from "@/lib/audit-logger";
import { auditLogger } from "@/lib/audit-logger";
import { emailService } from "@/lib/email-service";
import { db } from "@/lib/firebase/firebase-admin";
import redis from "@/lib/redis";
import { logger } from "@/utils/logger";

const RECOVERY_RATE_LIMIT = 3;
const RECOVERY_COOLDOWN = 24 * 60 * 60 * 1000;
const RECOVERY_TOKEN_EXPIRY = 3600; // 1 hour

export interface RecoveryState {
  publicKey: string;
  email: string;
  recoveryCode: string;
  timestamp: number;
}

export class RecoveryService {
  /**
   * Checks if a user is eligible to initiate recovery
   */
  static async checkEligibility(
    publicKey: string
  ): Promise<{ allowed: boolean; reason?: string; status?: number }> {
    if (!redis) {
      logger.error("[RecoveryService] Redis not configured");
      return { allowed: false, reason: "System configuration error", status: 500 };
    }

    const rateLimitKey = `recovery_attempts:${publicKey}`;
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts) >= RECOVERY_RATE_LIMIT) {
      return {
        allowed: false,
        reason: "Too many recovery attempts. Please try again later.",
        status: 429,
      };
    }

    const recoveryKey = `recovery_in_progress:${publicKey}`;
    const recoveryInProgress = await redis.get(recoveryKey);
    if (recoveryInProgress) {
      return {
        allowed: false,
        reason: "Recovery already in progress. Please check your email.",
        status: 409,
      };
    }

    return { allowed: true };
  }

  /**
   * Verifies user exists, has passkeys, and email matches
   */
  static async verifyUserRecord(
    publicKey: string,
    email?: string
  ): Promise<{ exists: boolean; hasPasskeys: boolean; emailMatch: boolean }> {
    const userDoc = await db.collection("players").doc(publicKey).get();
    if (!userDoc.exists) return { exists: false, hasPasskeys: false, emailMatch: false };

    const userData = userDoc.data();
    const storedEmail = userData?.["email"] || userData?.["recoveryEmail"];

    // If email provided, verify ownership
    const emailMatch = email ? storedEmail?.toLowerCase() === email.toLowerCase() : true;

    const passkeysSnapshot = await db
      .collection("players")
      .doc(publicKey)
      .collection("passkeys")
      .get();
    return { exists: true, hasPasskeys: !passkeysSnapshot.empty, emailMatch };
  }

  /**
   * Initiates recovery and returns the token
   */
  static async initiateRecovery(
    publicKey: string,
    email: string,
    metadata: AuditEventMetadata = {}
  ): Promise<string | null> {
    const recoveryToken = crypto.randomUUID();
    const recoveryCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      // Store state in Redis
      await redis.setex(
        `recovery_token:${recoveryToken}`,
        RECOVERY_TOKEN_EXPIRY,
        JSON.stringify({
          publicKey,
          email,
          recoveryCode,
          timestamp: Date.now(),
        })
      );

      // Mark in progress
      await redis.setex(`recovery_in_progress:${publicKey}`, RECOVERY_COOLDOWN / 1000, "true");

      // Rate limit
      const rateLimitKey = `recovery_attempts:${publicKey}`;
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 3600);

      // Send email
      await emailService.sendRecoveryEmail(email, recoveryCode);

      await auditLogger.logEvent(
        "ACCOUNT_RECOVERY_INITIATED",
        "Account recovery started",
        { ...metadata, userId: publicKey, email },
        "warn"
      );

      return recoveryToken;
    } catch (error) {
      logger.error("[RecoveryService] Failed to initiate recovery:", error);
      return null;
    }
  }

  /**
   * Gets recovery state from token
   */
  static async getRecoveryState(recoveryToken: string): Promise<RecoveryState | null> {
    const dataStr = await redis.get(`recovery_token:${recoveryToken}`);
    if (!dataStr) return null;
    try {
      return JSON.parse(dataStr);
    } catch {
      return null;
    }
  }

  /**
   * Resets user passkeys and cleans up recovery state
   */
  static async resetAccount(
    recoveryToken: string,
    state: RecoveryState,
    metadata: AuditEventMetadata = {}
  ): Promise<boolean> {
    const { publicKey } = state;
    try {
      const passkeysRef = db.collection("players").doc(publicKey).collection("passkeys");
      const snapshots = await passkeysRef.get();
      const batch = db.batch();
      snapshots.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      await redis.del(`recovery_token:${recoveryToken}`);
      await redis.del(`recovery_in_progress:${publicKey}`);

      await auditLogger.logEvent(
        "ACCOUNT_RECOVERY_VERIFIED",
        "Account recovery successful",
        { ...metadata, userId: publicKey },
        "warn"
      );

      // Send follow-up email
      await emailService.sendCustomEmail(
        state.email,
        "Account Recovery Successful",
        "Your account passkeys have been reset successfully. You can now set up a new passkey."
      );

      return true;
    } catch (error) {
      logger.error("[RecoveryService] Failed to reset account:", error);
      return false;
    }
  }

  /**
   * Cancels an active recovery
   */
  static async cancelRecovery(
    recoveryToken: string,
    publicKey: string,
    metadata: AuditEventMetadata = {}
  ): Promise<void> {
    await redis.del(`recovery_token:${recoveryToken}`);
    await redis.del(`recovery_in_progress:${publicKey}`);
    await auditLogger.logEvent(
      "ACCOUNT_RECOVERY_CANCELLED",
      "Account recovery cancelled",
      { ...metadata, userId: publicKey },
      "info"
    );
  }
}
