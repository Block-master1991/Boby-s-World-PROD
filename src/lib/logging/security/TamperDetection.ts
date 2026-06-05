import { professionalLogger } from "../index";
import type {
  SignedLogEntry,
  TamperDetectionConfig,
  VerificationResult,
} from "./TamperDetectionTypes";

export type { SignedLogEntry, TamperDetectionConfig, VerificationResult };

/**
 * Safe cross-runtime crypto detection (Node, Browser, Edge)
 */
const getCrypto = () => {
  try {
    const g =
      typeof globalThis !== "undefined"
        ? globalThis
        : typeof window !== "undefined"
          ? window
          : typeof self !== "undefined"
            ? self
            : {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((g as any).crypto) return (g as any).crypto;

    // Final fallback for Node.js environments where it might not be on globalThis
    if (typeof process !== "undefined" && process.versions?.node) {
      // eslint-disable-next-line no-eval
      return eval('require("node:crypto")');
    }
    return null;
  } catch {
    return null;
  }
};

const DEFAULT_CONFIG: TamperDetectionConfig = {
  enabled: false,
  algorithm: "sha256",
  includeChain: true,
  alertOnTampering: true,
};

/**
 * Tamper Detection Class
 * Detects unauthorized modifications to log entries using cryptographic chaining
 */
export class TamperDetection {
  private config: TamperDetectionConfig;
  private secret: Buffer;
  private lastHash: string | null = null;
  private sequence: number = 0;

  constructor(config: Partial<TamperDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.secret = this.config.enabled ? this.initializeSecret() : Buffer.alloc(32);
  }

  /**
   * Initialize HMAC secret from environment or random fallback
   */
  private initializeSecret(): Buffer {
    const envSecret = process.env["LOG_SIGNING_SECRET"];
    if (envSecret) return Buffer.from(envSecret, "utf-8");

    if (typeof window === "undefined") {
      // eslint-disable-next-line no-console
      console.warn(
        "[TamperDetection] No LOG_SIGNING_SECRET found. Using temporary secret. NOT SECURE FOR PRODUCTION!"
      );
    }

    const crypto = getCrypto();
    return crypto?.randomBytes ? crypto.randomBytes(32) : Buffer.alloc(32);
  }

  /**
   * Sign a log entry
   */
  sign(data: unknown): SignedLogEntry | null {
    if (!this.config.enabled) return null;

    try {
      const timestamp = Date.now();
      this.sequence++;
      const dataHash = this.hashData(data);

      const entry: SignedLogEntry = {
        data,
        hash: dataHash,
        previousHash: this.config.includeChain ? (this.lastHash ?? undefined) : undefined,
        timestamp,
        sequence: this.sequence,
        signature: "",
      };

      entry.signature = this.createSignature(entry);
      if (this.config.includeChain) this.lastHash = dataHash;
      return entry;
    } catch (error) {
      professionalLogger.error("[TamperDetection] Signing failed", error);
      return null;
    }
  }

  /**
   * Verify a signed log entry
   */
  verify(entry: SignedLogEntry): VerificationResult {
    if (!this.config.enabled) {
      return { valid: true, entry, errors: ["Tamper detection disabled"] };
    }

    const errors: string[] = [];
    this.checkDataIntegrity(entry, errors);
    this.checkSignature(entry, errors);
    this.checkTimestamp(entry, errors);

    const valid = errors.length === 0;
    if (!valid && this.config.alertOnTampering) this.alertTampering(entry, errors);

    return { valid, entry, errors };
  }

  private checkDataIntegrity(entry: SignedLogEntry, errors: string[]): void {
    const expectedHash = this.hashData(entry.data);
    if (entry.hash !== expectedHash) {
      errors.push("Data hash mismatch - data has been tampered");
    }
  }

  private checkSignature(entry: SignedLogEntry, errors: string[]): void {
    const { signature, ...entryWithoutSignature } = entry;
    const expectedSignature = this.createSignature(entryWithoutSignature);
    if (signature !== expectedSignature) {
      errors.push("Signature invalid - entry has been tampered");
    }
  }

  private checkTimestamp(entry: SignedLogEntry, errors: string[]): void {
    const now = Date.now();
    if (entry.timestamp > now) {
      errors.push("Timestamp is in the future");
    }
    const maxAge = 365 * 24 * 60 * 60 * 1000;
    if (now - entry.timestamp > maxAge) {
      errors.push("Timestamp is too old");
    }
  }

  /**
   * Verify a chain of log entries
   */
  verifyChain(entries: SignedLogEntry[]): {
    valid: boolean;
    errors: Array<{ index: number; errors: string[] }>;
  } {
    if (!this.config.includeChain) {
      return { valid: false, errors: [{ index: -1, errors: ["Chain verification not enabled"] }] };
    }

    const chainErrors: Array<{ index: number; errors: string[] }> = [];
    let previousHash: string | undefined;

    entries.forEach((entry, i) => {
      const errors: string[] = [];
      const result = this.verify(entry);
      if (!result.valid) errors.push(...result.errors);

      if (i > 0) {
        if (entry.previousHash !== previousHash) {
          errors.push(`Chain broken: previousHash mismatch at index ${i}`);
        }
        const prevEntry = entries[i - 1];
        if (prevEntry && entry.sequence !== prevEntry.sequence + 1) {
          errors.push(`Sequence number gap at index ${i}`);
        }
      }

      if (errors.length > 0) chainErrors.push({ index: i, errors });
      previousHash = entry.hash;
    });

    return { valid: chainErrors.length === 0, errors: chainErrors };
  }

  /**
   * Hash data for integrity verification
   */
  private hashData(data: unknown): string {
    const dataString = typeof data === "string" ? data : JSON.stringify(data);
    const crypto = getCrypto();
    if (!crypto) return "edge-unsupported-hash";

    return crypto.createHash(this.config.algorithm!).update(dataString).digest("hex");
  }

  /**
   * Create HMAC signature for entry
   */
  private createSignature(entry: Omit<SignedLogEntry, "signature">): string {
    const serialized = JSON.stringify({
      hash: entry.hash,
      previousHash: entry.previousHash,
      timestamp: entry.timestamp,
      sequence: entry.sequence,
    });

    const crypto = getCrypto();
    if (!crypto) return "edge-unsupported-hmac";

    return crypto.createHmac(this.config.algorithm!, this.secret).update(serialized).digest("hex");
  }

  /**
   * Alert about tampering attempt
   */
  private alertTampering(entry: SignedLogEntry, errors: string[]): void {
    // eslint-disable-next-line no-console
    console.error("[SECURITY ALERT] Log tampering detected!", {
      sequence: entry.sequence,
      timestamp: entry.timestamp,
      errors,
    });
  }

  /**
   * Chain management methods
   */
  getChainState(): { lastHash: string | null; sequence: number } {
    return { lastHash: this.lastHash, sequence: this.sequence };
  }

  resetChain(): void {
    this.lastHash = null;
    this.sequence = 0;
  }

  exportEntry(entry: SignedLogEntry): string {
    return JSON.stringify(entry);
  }

  importEntry(entryString: string): SignedLogEntry | null {
    try {
      return JSON.parse(entryString) as SignedLogEntry;
    } catch {
      return null;
    }
  }

  /**
   * Create merkle root for batch verification
   */
  createMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return "";
    if (hashes.length === 1) return hashes[0] ?? "";

    let currentLevel = [...hashes];
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const h1 = currentLevel[i] ?? "";
        const h2 = currentLevel[i + 1] ?? h1;
        const combined = h1 + h2;
        const crypto = getCrypto();
        if (!crypto) return "edge-unsupported-merkle";
        nextLevel.push(crypto.createHash(this.config.algorithm!).update(combined).digest("hex"));
      }
      currentLevel = nextLevel;
    }
    return currentLevel[0] ?? "";
  }

  updateConfig(config: Partial<TamperDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

const isServer = typeof window === "undefined";
export const defaultTamperDetection = new TamperDetection({
  enabled: isServer && process.env["LOG_TAMPER_DETECTION"] === "true",
  algorithm: "sha256",
  includeChain: true,
  alertOnTampering: true,
});

export function signLog(data: unknown): SignedLogEntry | null {
  return defaultTamperDetection.sign(data);
}
export function verifyLog(entry: SignedLogEntry): VerificationResult {
  return defaultTamperDetection.verify(entry);
}
