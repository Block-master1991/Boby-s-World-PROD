import crypto from "crypto";

/**
 * Advanced Encryption Utility for Sensitive Data
 * Uses AES-256-GCM for authenticated encryption.
 */
export class EncryptionUtils {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH = 12;
  private static readonly SALT = "boby-world-totp-salt"; // Persistent salt for key derivation

  /**
   * Gets the encryption key from environment variables
   */
  private static getEncryptionKey(): Buffer {
    const secret = process.env["TOTP_ENCRYPTION_KEY"] || process.env["MASTER_ENCRYPTION_KEY"];
    if (!secret) {
      throw new Error("TOTP_ENCRYPTION_KEY or MASTER_ENCRYPTION_KEY must be defined");
    }
    // Derive a 32-byte key from the secret
    return crypto.scryptSync(secret, this.SALT, 32);
  }

  /**
   * Encrypts a string
   * Returns: iv:authTag:encryptedData (all hex)
   */
  public static encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const key = this.getEncryptionKey();
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag().toString("hex");

      return `${iv.toString("hex")}:${authTag}:${encrypted}`;
    } catch {
      throw new Error("Encryption failed");
    }
  }

  /**
   * Decrypts an encrypted string
   */
  public static decrypt(encryptedText: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
      if (!ivHex || !authTagHex || !encrypted) {
        throw new Error("Invalid format");
      }

      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch {
      // If it's not encrypted (legacy data), return as is for backward compatibility
      // or throw error depending on policy. Here we return null to signal failure.
      return "";
    }
  }

  /**
   * Helper to check if a string is likely encrypted with this utility
   */
  public static isEncrypted(text: string): boolean {
    return text.includes(":") && text.split(":").length === 3;
  }
}
