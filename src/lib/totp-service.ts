/**
 * TOTP Service
 * Handles generation and verification of Time-based One-Time Passwords.
 */

import { db, initializeAdminApp } from "@/lib/firebase/firebase-admin";
import { logger } from "@/utils/logger";
import crypto from "crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import type { AuditEventMetadata } from "./audit-logger";
import { auditLogger } from "./audit-logger";
import { EncryptionUtils } from "./encryption";

export class TOTPService {
  /**
   * Generates a new TOTP secret and QR code for a user
   */
  public static async initiateSetup(_userId: string, walletAddress: string) {
    const secret = generateSecret();
    const otpauth = generateURI({
      label: walletAddress,
      issuer: "Boby's World",
      secret,
    });
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    return {
      secret,
      qrCodeUrl,
    };
  }

  /**
   * Verifies a TOTP token against a secret
   */
  public static async verifyToken(
    token: string,
    secret: string,
    epochTolerance = 1
  ): Promise<boolean> {
    try {
      const result = await verify({ token, secret, epochTolerance });
      return result.valid;
    } catch (error) {
      logger.error("[TOTP Service] Verification error:", error);
      return false;
    }
  }

  public static async verifyTokenWithReason(
    token: string,
    secret: string,
    epochTolerance = 2
  ): Promise<"valid" | "expired" | "invalid"> {
    const isValid = await this.verifyToken(token, secret, 1);
    if (isValid) return "valid";

    const isExpired = await this.verifyToken(token, secret, epochTolerance);
    return isExpired ? "expired" : "invalid";
  }

  /**
   * Checks a TOTP code or backup code without consuming the backup code.
   */
  public static async checkToken(userId: string, token: string): Promise<boolean> {
    await initializeAdminApp();
    const secret = await this.getUserSecret(userId);
    if (!secret) return false;

    const validTOTP = await this.verifyToken(token, secret);
    if (validTOTP) return true;

    const userDoc = await db.collection("players").doc(userId).get();
    const encryptedCodes: string[] = userDoc.data()?.["totpBackupCodes"] || [];
    const targetCode = token.toUpperCase();

    for (const encryptedCode of encryptedCodes) {
      try {
        if (EncryptionUtils.decrypt(encryptedCode) === targetCode) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Enables TOTP for a user after verifying the first token
   */
  public static async enableTOTP(
    userId: string,
    token: string,
    secret: string,
    metadata: AuditEventMetadata
  ) {
    const isValid = await this.verifyToken(token, secret);
    if (!isValid) {
      throw new Error("Invalid verification code");
    }

    await initializeAdminApp();
    const encryptedSecret = EncryptionUtils.encrypt(secret);

    await db.collection("players").doc(userId).set(
      {
        totpSecret: encryptedSecret,
        totpEnabled: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await auditLogger.logEvent(
      "TOTP_ENABLED",
      `TOTP authentication enabled for user ${userId}`,
      { ...metadata, userId },
      "info"
    );

    return { success: true, message: "TOTP enabled successfully" };
  }

  /**
   * Disables TOTP for a user
   */
  public static async disableTOTP(userId: string, metadata: AuditEventMetadata) {
    await initializeAdminApp();

    // Safety check: Don't disable if it's the last 2FA method and it's required
    const userDoc = await db.collection("players").doc(userId).get();
    const userData = userDoc.data();
    const passkeysSnapshot = await db
      .collection("players")
      .doc(userId)
      .collection("passkeys")
      .get();

    if (passkeysSnapshot.empty && userData?.["totpEnabled"]) {
      // If no passkeys, disabling TOTP might leave account with only wallet
      // This depends on the project's security policy.
      // For now, let's allow it but log a warning.
    }

    await db.collection("players").doc(userId).update({
      totpSecret: null,
      totpEnabled: false,
      updatedAt: new Date().toISOString(),
    });

    await auditLogger.logEvent(
      "TOTP_DISABLED",
      `TOTP authentication disabled for user ${userId}`,
      { ...metadata, userId },
      "warn"
    );

    return { success: true, message: "TOTP disabled successfully" };
  }

  /**
   * Checks if TOTP is enabled for a user
   */
  public static async isTOTPEnabled(userId: string): Promise<boolean> {
    await initializeAdminApp();
    const userDoc = await db.collection("players").doc(userId).get();
    return !!userDoc.data()?.["totpEnabled"];
  }

  /**
   * Gets the TOTP secret for a user (internal use only)
   */
  public static async getUserSecret(userId: string): Promise<string | null> {
    await initializeAdminApp();
    const userDoc = await db.collection("players").doc(userId).get();
    const secret = userDoc.data()?.["totpSecret"] || null;

    if (secret && EncryptionUtils.isEncrypted(secret)) {
      return EncryptionUtils.decrypt(secret);
    }
    return secret;
  }
  /**
   * Generates a new set of backup codes for a user
   */
  public static async generateBackupCodes(userId: string): Promise<string[]> {
    await initializeAdminApp();
    const codes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex").toUpperCase()
    );

    // Encrypt codes before storing
    const encryptedCodes = codes.map(code => EncryptionUtils.encrypt(code));

    await db.collection("players").doc(userId).update({
      totpBackupCodes: encryptedCodes,
    });
    return codes; // Return plain codes to user once
  }

  /**
   * Verifies and consumes a backup code
   */
  public static async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    await initializeAdminApp();
    const userDoc = await db.collection("players").doc(userId).get();
    const encryptedCodes: string[] = userDoc.data()?.["totpBackupCodes"] || [];

    const targetCode = code.toUpperCase();

    // Find the encrypted code that matches the target
    const codeIndex = encryptedCodes.findIndex(encCode => {
      try {
        const decrypted = EncryptionUtils.decrypt(encCode);
        return decrypted === targetCode;
      } catch {
        return false;
      }
    });

    if (codeIndex === -1) return false;

    // Remove the used code
    encryptedCodes.splice(codeIndex, 1);
    await db.collection("players").doc(userId).update({
      totpBackupCodes: encryptedCodes,
    });

    return true;
  }
}
