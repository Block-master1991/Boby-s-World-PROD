/**
 * Tamper Detection - Cryptographic Log Integrity Verification
 * Detects unauthorized modifications to log entries using blockchain-style chaining
 */

import { createHash, createHmac } from 'crypto';
import { professionalLogger } from '../index';

export interface TamperDetectionConfig {
    enabled: boolean;
    algorithm?: 'sha256' | 'sha512';
    includeChain?: boolean;
    alertOnTampering?: boolean;
}

const DEFAULT_CONFIG: TamperDetectionConfig = {
    enabled: false,
    algorithm: 'sha256',
    includeChain: true,
    alertOnTampering: true
};

/**
 * Signed log entry
 */
export interface SignedLogEntry {
    data: any;
    hash: string;
    previousHash?: string;
    timestamp: number;
    sequence: number;
    signature: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
    valid: boolean;
    entry: SignedLogEntry;
    errors: string[];
}

/**
 * Tamper Detection Class
 */
export class TamperDetection {
    private config: TamperDetectionConfig;
    private secret: Buffer;
    private lastHash: string | null = null;
    private sequence: number = 0;

    constructor(config: Partial<TamperDetectionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Only initialize secret if enabled (to avoid browser warnings)
        if (this.config.enabled) {
            this.secret = this.initializeSecret();
        } else {
            // Dummy secret for disabled mode
            this.secret = Buffer.alloc(32);
        }
    }

    /**
     * Initialize HMAC secret
     */
    private initializeSecret(): Buffer {
        const envSecret = process.env.LOG_SIGNING_SECRET;

        if (envSecret) {
            return Buffer.from(envSecret, 'utf-8');
        }

        // Only warn on server-side
        if (typeof window === 'undefined') {
            // eslint-disable-next-line no-console
            console.warn('[TamperDetection] No LOG_SIGNING_SECRET found. Using temporary secret. NOT SECURE FOR PRODUCTION!');
        }

        // Generate random secret (should be stored securely)
        const crypto = require('crypto');
        return crypto.randomBytes(32);
    }

    /**
     * Sign a log entry
     */
    sign(data: any): SignedLogEntry | null {
        if (!this.config.enabled) {
            return null;
        }

        try {
            const timestamp = Date.now();
            this.sequence++;

            // Create hash of the data
            const dataHash = this.hashData(data);

            // Create signed entry
            const entry: SignedLogEntry = {
                data,
                hash: dataHash,
                previousHash: this.config.includeChain ? this.lastHash || undefined : undefined,
                timestamp,
                sequence: this.sequence,
                signature: '' // Will be filled below
            };

            // Sign the entry
            entry.signature = this.createSignature(entry);

            // Update last hash for chaining
            if (this.config.includeChain) {
                this.lastHash = dataHash;
            }

            return entry;
        } catch (error) {
            professionalLogger.error('[TamperDetection] Signing failed', error);
            return null;
        }
    }

    /**
     * Verify a signed log entry
     */
    verify(entry: SignedLogEntry): VerificationResult {
        const errors: string[] = [];
        let valid = true;

        if (!this.config.enabled) {
            return { valid: true, entry, errors: ['Tamper detection disabled'] };
        }

        try {
            // 1. Verify data hash
            const expectedHash = this.hashData(entry.data);
            if (entry.hash !== expectedHash) {
                errors.push('Data hash mismatch - data has been tampered');
                valid = false;
            }

            // 2. Verify signature
            const { signature, ...entryWithoutSignature } = entry;
            const expectedSignature = this.createSignature(entryWithoutSignature);

            if (signature !== expectedSignature) {
                errors.push('Signature invalid - entry has been tampered');
                valid = false;
            }

            // 3. Verify timestamp is reasonable
            const now = Date.now();
            if (entry.timestamp > now) {
                errors.push('Timestamp is in the future');
                valid = false;
            }

            // Timestamp should not be too old (configurable threshold)
            const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year
            if (now - entry.timestamp > maxAge) {
                errors.push('Timestamp is too old');
                valid = false;
            }

        } catch (error) {
            errors.push(`Verification failed: ${error}`);
            valid = false;
        }

        // Alert on tampering if configured
        if (!valid && this.config.alertOnTampering) {
            this.alertTampering(entry, errors);
        }

        return { valid, entry, errors };
    }

    /**
     * Verify a chain of log entries
     */
    verifyChain(entries: SignedLogEntry[]): {
        valid: boolean;
        errors: Array<{ index: number; errors: string[] }>;
    } {
        if (!this.config.includeChain) {
            return {
                valid: false,
                errors: [{ index: -1, errors: ['Chain verification not enabled'] }]
            };
        }

        const chainErrors: Array<{ index: number; errors: string[] }> = [];
        let previousHash: string | undefined;

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const errors: string[] = [];

            // Verify individual entry
            const result = this.verify(entry);
            if (!result.valid) {
                errors.push(...result.errors);
            }

            // Verify chain link
            if (i > 0) {
                if (entry.previousHash !== previousHash) {
                    errors.push(`Chain broken: previousHash mismatch at index ${i}`);
                }

                if (entry.sequence !== entries[i - 1].sequence + 1) {
                    errors.push(`Sequence number gap at index ${i}`);
                }
            }

            if (errors.length > 0) {
                chainErrors.push({ index: i, errors });
            }

            previousHash = entry.hash;
        }

        return {
            valid: chainErrors.length === 0,
            errors: chainErrors
        };
    }

    /**
     * Hash data for integrity verification
     */
    private hashData(data: any): string {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);

        return createHash(this.config.algorithm!)
            .update(dataString)
            .digest('hex');
    }

    /**
     * Create HMAC signature for entry
     */
    private createSignature(entry: Omit<SignedLogEntry, 'signature'>): string {
        // Serialize entry (excluding signature)
        const serialized = JSON.stringify({
            hash: entry.hash,
            previousHash: entry.previousHash,
            timestamp: entry.timestamp,
            sequence: entry.sequence
        });

        // Create HMAC
        return createHmac(this.config.algorithm!, this.secret)
            .update(serialized)
            .digest('hex');
    }

    /**
     * Alert about tampering attempt
     */
    private alertTampering(entry: SignedLogEntry, errors: string[]): void {
        // eslint-disable-next-line no-console
        console.error('[SECURITY ALERT] Log tampering detected!', {
            sequence: entry.sequence,
            timestamp: entry.timestamp,
            errors: errors
        });

        // In production, this should send to security monitoring
        // e.g., Sentry, Datadog, Slack, etc.
    }

    /**
     * Get current chain state
     */
    getChainState(): {
        lastHash: string | null;
        sequence: number;
    } {
        return {
            lastHash: this.lastHash,
            sequence: this.sequence
        };
    }

    /**
     * Reset chain state
     */
    resetChain(): void {
        this.lastHash = null;
        this.sequence = 0;
    }

    /**
     * Export entry for storage
     */
    exportEntry(entry: SignedLogEntry): string {
        return JSON.stringify(entry);
    }

    /**
     * Import entry from storage
     */
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
        if (hashes.length === 0) {
            return '';
        }

        if (hashes.length === 1) {
            return hashes[0];
        }

        // Create merkle tree
        let currentLevel = [...hashes];

        while (currentLevel.length > 1) {
            const nextLevel: string[] = [];

            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    // Hash pair
                    const combined = currentLevel[i] + currentLevel[i + 1];
                    const hash = createHash(this.config.algorithm!).update(combined).digest('hex');
                    nextLevel.push(hash);
                } else {
                    // Odd one out, promote to next level
                    nextLevel.push(currentLevel[i]);
                }
            }

            currentLevel = nextLevel;
        }

        return currentLevel[0];
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<TamperDetectionConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Default instance
 */
const isServer = typeof window === 'undefined';
export const defaultTamperDetection = new TamperDetection({
    enabled: isServer && process.env.LOG_TAMPER_DETECTION === 'true',
    algorithm: 'sha256',
    includeChain: true,
    alertOnTampering: true
});

/**
 * Helper function for quick signing
 */
export function signLog(data: any): SignedLogEntry | null {
    return defaultTamperDetection.sign(data);
}

/**
 * Helper function for quick verification
 */
export function verifyLog(entry: SignedLogEntry): VerificationResult {
    return defaultTamperDetection.verify(entry);
}
