/**
 * Log Encryption - AES-256-GCM Encryption for Sensitive Logs
 * Encrypts sensitive log data before storage
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

export interface EncryptionConfig {
    enabled: boolean;
    algorithm?: string;
    keyDerivation?: 'pbkdf2' | 'direct';
    encryptedFields?: string[];
    keyRotationDays?: number;
}

const DEFAULT_CONFIG: EncryptionConfig = {
    enabled: false,
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    encryptedFields: ['password', 'token', 'secret', 'apiKey', 'privateKey'],
    keyRotationDays: 90
};

/**
 * Encrypted data structure
 */
export interface EncryptedData {
    encrypted: string;      // Base64 encoded encrypted data
    iv: string;            // Base64 encoded IV
    authTag: string;       // Base64 encoded auth tag
    algorithm: string;     // Algorithm used
    keyId?: string;        // Key identifier (for rotation)
    timestamp: number;     // Encryption timestamp
}

/**
 * Log Encryption Class
 */
export class LogEncryption {
    private config: EncryptionConfig;
    private masterKey: Buffer | null = null;
    private keyId: string;
    private keyCreatedAt: number;

    constructor(config: Partial<EncryptionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.keyId = this.generateKeyId();
        this.keyCreatedAt = Date.now();

        // Initialize master key
        if (this.config.enabled) {
            this.initializeMasterKey();
        }
    }

    /**
     * Initialize master encryption key
     */
    private initializeMasterKey(): void {
        // Get key from environment or generate one
        const envKey = process.env.LOG_ENCRYPTION_KEY;

        if (envKey) {
            // Derive key from environment variable
            this.masterKey = this.deriveKey(envKey);
        } else {
            // Only warn on server-side to avoid browser console spam
            if (typeof window === 'undefined') {
                console.warn('[LogEncryption] No LOG_ENCRYPTION_KEY found. Generating temporary key. THIS IS NOT SECURE FOR PRODUCTION!');
            }
            this.masterKey = randomBytes(32); // 256 bits
        }
    }

    /**
     * Derive encryption key from password/secret
     */
    private deriveKey(secret: string, salt?: Buffer): Buffer {
        if (this.config.keyDerivation === 'direct') {
            // Direct: hash the secret to get 256-bit key
            return createHash('sha256').update(secret).digest();
        }

        // PBKDF2: more secure key derivation
        const crypto = require('crypto');
        const usedSalt = salt || Buffer.from('boby-world-logs'); // Default salt (should be unique per app)

        return crypto.pbkdf2Sync(
            secret,
            usedSalt,
            100000, // iterations
            32,     // key length (256 bits)
            'sha256'
        );
    }

    /**
     * Generate unique key ID
     */
    private generateKeyId(): string {
        return `key-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }

    /**
     * Check if key rotation is needed
     */
    private needsKeyRotation(): boolean {
        if (!this.config.keyRotationDays) {
            return false;
        }

        const daysSinceCreation = (Date.now() - this.keyCreatedAt) / (1000 * 60 * 60 * 24);
        return daysSinceCreation >= this.config.keyRotationDays;
    }

    /**
     * Rotate encryption key
     */
    rotateKey(): void {
        if (!this.config.enabled) {
            return;
        }

        console.warn('[LogEncryption] Rotating encryption key');
        this.keyId = this.generateKeyId();
        this.keyCreatedAt = Date.now();
        this.initializeMasterKey();
    }

    /**
     * Encrypt data
     */
    encrypt(data: string | object): EncryptedData | null {
        if (!this.config.enabled || !this.masterKey) {
            return null;
        }

        try {
            // Check for key rotation
            if (this.needsKeyRotation()) {
                this.rotateKey();
            }

            // Convert data to string if needed
            const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

            // Generate random IV (Initialization Vector)
            const iv = randomBytes(16); // 128 bits for GCM

            // Create cipher
            const cipher = createCipheriv(
                this.config.algorithm!,
                this.masterKey,
                iv
            ) as any; // Type assertion needed for getAuthTag

            // Encrypt
            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');

            // Get auth tag (GCM mode)
            const authTag = cipher.getAuthTag();

            return {
                encrypted: encrypted,
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64'),
                algorithm: this.config.algorithm!,
                keyId: this.keyId,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('[LogEncryption] Encryption failed:', error);
            return null;
        }
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData: EncryptedData): string | null {
        if (!this.config.enabled || !this.masterKey) {
            return null;
        }

        try {
            // Convert from base64
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const authTag = Buffer.from(encryptedData.authTag, 'base64');
            const encrypted = encryptedData.encrypted;

            // Create decipher
            const decipher = createDecipheriv(
                encryptedData.algorithm,
                this.masterKey,
                iv
            ) as any; // Type assertion needed for setAuthTag

            // Set auth tag
            decipher.setAuthTag(authTag);

            // Decrypt
            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('[LogEncryption] Decryption failed:', error);
            return null;
        }
    }

    /**
     * Encrypt specific fields in an object
     */
    encryptFields(data: any): any {
        if (!this.config.enabled || !data || typeof data !== 'object') {
            return data;
        }

        const result = Array.isArray(data) ? [...data] : { ...data };

        for (const [key, value] of Object.entries(result)) {
            // Check if this field should be encrypted
            if (this.shouldEncryptField(key)) {
                if (value !== null && value !== undefined) {
                    const encrypted = this.encrypt(value);
                    if (encrypted) {
                        result[key] = {
                            _encrypted: true,
                            ...encrypted
                        };
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                // Recursively encrypt nested objects
                result[key] = this.encryptFields(value);
            }
        }

        return result;
    }

    /**
     * Decrypt specific fields in an object
     */
    decryptFields(data: any): any {
        if (!this.config.enabled || !data || typeof data !== 'object') {
            return data;
        }

        const result = Array.isArray(data) ? [...data] : { ...data };

        for (const [key, value] of Object.entries(result)) {
            if (this.isEncryptedField(value)) {
                // Decrypt this field
                const decrypted = this.decrypt(value as EncryptedData);
                if (decrypted) {
                    try {
                        // Try to parse as JSON
                        result[key] = JSON.parse(decrypted);
                    } catch {
                        // Keep as string
                        result[key] = decrypted;
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                // Recursively decrypt nested objects
                result[key] = this.decryptFields(value);
            }
        }

        return result;
    }

    /**
     * Check if a field should be encrypted
     */
    private shouldEncryptField(fieldName: string): boolean {
        const normalized = fieldName.toLowerCase();
        return this.config.encryptedFields?.some(field =>
            normalized.includes(field.toLowerCase())
        ) || false;
    }

    /**
     * Check if a value is an encrypted field
     */
    private isEncryptedField(value: any): boolean {
        return (
            typeof value === 'object' &&
            value !== null &&
            value._encrypted === true &&
            'encrypted' in value &&
            'iv' in value &&
            'authTag' in value
        );
    }

    /**
     * Export encrypted data as string (for storage)
     */
    exportEncrypted(encryptedData: EncryptedData): string {
        return JSON.stringify(encryptedData);
    }

    /**
     * Import encrypted data from string
     */
    importEncrypted(encryptedString: string): EncryptedData | null {
        try {
            return JSON.parse(encryptedString) as EncryptedData;
        } catch {
            return null;
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<EncryptionConfig>): void {
        this.config = { ...this.config, ...config };

        if (this.config.enabled && !this.masterKey) {
            this.initializeMasterKey();
        }
    }

    /**
     * Get current key ID
     */
    getCurrentKeyId(): string {
        return this.keyId;
    }
}

/**
 * Default instance - only created on server side
 */
const isServer = typeof window === 'undefined';
export const defaultEncryption = new LogEncryption({
    enabled: isServer && process.env.LOG_ENCRYPTION_ENABLED === 'true',
    algorithm: 'aes-256-gcm'
});

/**
 * Helper function for quick encryption
 */
export function encryptLog(data: string | object): EncryptedData | null {
    return defaultEncryption.encrypt(data);
}

/**
 * Helper function for quick decryption
 */
export function decryptLog(encryptedData: EncryptedData): string | null {
    return defaultEncryption.decrypt(encryptedData);
}
