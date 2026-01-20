import type { EncryptedData, EncryptionConfig, ILogEncryption } from './EncryptionTypes';

import { professionalLogger } from '../logger-instance';

// Lazy logger accessor not strictly needed with ESM live bindings, 
// but we keep a helper if we want to ensure it's available or mock it.
const getLogger = () => professionalLogger;

// Safe cross-runtime crypto detection (Node, Browser, Edge)
// Safe cross-runtime crypto detection (Node, Browser, Edge)
const getCrypto = () => {
    try {
        // Prioritize Node.js crypto if we're in a Node environment
        if (typeof process !== 'undefined' && process.versions?.node) {
            try {
                // eslint-disable-next-line no-eval
                return eval('require("node:crypto")');
            } catch {
                // Ignore error (e.g. in strict ESM without require), fall through to Web Crypto
            }
        }

        // Fallback to Web Crypto API (Browser/Edge)
        const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : {}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((g as any).crypto) return (g as any).crypto;
        
        return null;
    } catch {
        return null;
    }
};

const DEFAULT_CONFIG: EncryptionConfig = {
    enabled: false,
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2',
    encryptedFields: ['password', 'token', 'secret', 'apiKey', 'privateKey'],
    keyRotationDays: 90
};

/**
 * Log Encryption Class
 */
export class LogEncryption implements ILogEncryption {
    private config: EncryptionConfig;
    private masterKey: Buffer | Uint8Array | null = null;
    private keyId: string;
    private keyCreatedAt: number;

    constructor(config: Partial<EncryptionConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.keyId = this.generateKeyId();
        this.keyCreatedAt = Date.now();
        if (this.config.enabled) this.initializeMasterKey();
    }

    private initializeMasterKey(): void {
        const envKey = process.env['LOG_ENCRYPTION_KEY'];
        if (envKey) {
            this.masterKey = this.deriveKey(envKey);
        } else {
            if (typeof window === 'undefined') {
                // eslint-disable-next-line no-console
                console.warn('[LogEncryption] No LOG_ENCRYPTION_KEY found. Generating temporary key. THIS IS NOT SECURE FOR PRODUCTION!');
            }
            const cryptoModule = getCrypto();
            this.masterKey = cryptoModule?.randomBytes ? cryptoModule.randomBytes(32) : null;
        }
    }

    private deriveKey(secret: string, salt?: Buffer | Uint8Array): Buffer | Uint8Array | null {
        const cryptoModule = getCrypto();
        if (!cryptoModule) return null;
        
        if (this.config.keyDerivation === 'direct') {
            return cryptoModule.createHash ? cryptoModule.createHash('sha256').update(secret).digest() : null;
        }

        const usedSalt = salt || Buffer.from('boby-world-logs');
        if (!cryptoModule.pbkdf2Sync) {
            // eslint-disable-next-line no-console
            console.warn('[LogEncryption] pbkdf2Sync not available in this environment. Encryption disabled.');
            return null;
        }
        return cryptoModule.pbkdf2Sync(secret, usedSalt, 100000, 32, 'sha256');
    }

    private generateKeyId(): string {
        return `key-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }

    private needsKeyRotation(): boolean {
        if (!this.config.keyRotationDays) return false;
        const daysSinceCreation = (Date.now() - this.keyCreatedAt) / (1000 * 60 * 60 * 24);
        return daysSinceCreation >= this.config.keyRotationDays;
    }

    rotateKey(): void {
        if (!this.config.enabled) return;
        getLogger().warn('[LogEncryption] Rotating encryption key');
        this.keyId = this.generateKeyId();
        this.keyCreatedAt = Date.now();
        this.initializeMasterKey();
    }

    encrypt(data: string | object): EncryptedData | null {
        if (!this.config.enabled || !this.masterKey) return null;
        try {
            if (this.needsKeyRotation()) this.rotateKey();
            const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
            const cryptoModule = getCrypto();
            if (!cryptoModule?.createCipheriv) return null;

            const iv = cryptoModule.randomBytes(16);
            const cipher = cryptoModule.createCipheriv(this.config.algorithm!, this.masterKey, iv);

            let encrypted = cipher.update(plaintext, 'utf8', 'base64');
            encrypted += cipher.final('base64');
            const authTag = cipher.getAuthTag();

            return {
                encrypted,
                iv: iv.toString('base64'),
                authTag: authTag.toString('base64'),
                algorithm: this.config.algorithm!,
                keyId: this.keyId,
                timestamp: Date.now()
            };
        } catch (error) {
            getLogger().error('[LogEncryption] Encryption failed', error);
            return null;
        }
    }

    decrypt(encryptedData: EncryptedData): string | null {
        if (!this.config.enabled || !this.masterKey) return null;
        try {
            const { iv: ivB64, authTag: authTagB64, encrypted, algorithm } = encryptedData;
            const iv = Buffer.from(ivB64, 'base64');
            const authTag = Buffer.from(authTagB64, 'base64');

            const cryptoModule = getCrypto();
            if (!cryptoModule?.createDecipheriv) return null;

            const decipher = cryptoModule.createDecipheriv(algorithm, this.masterKey, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            getLogger().error('[LogEncryption] Decryption failed', error);
            return null;
        }
    }

    encryptFields<T>(data: T): T {
        if (!this.config.enabled || !data || typeof data !== 'object') return data;
        const result = (Array.isArray(data) ? [...data] : { ...data }) as Record<string, unknown> | unknown[];

        for (const [key, value] of Object.entries(result)) {
            if (this.shouldEncryptField(key)) {
                if (value !== null && value !== undefined) {
                    const encrypted = this.encrypt(value as string | object);
                    if (encrypted) {
                        (result as Record<string, unknown>)[key] = { _encrypted: true, ...encrypted };
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                (result as Record<string, unknown>)[key] = this.encryptFields(value);
            }
        }
        return result as T;
    }

    decryptFields<T>(data: T): T {
        if (!this.config.enabled || !data || typeof data !== 'object') return data;
        const result = (Array.isArray(data) ? [...data] : { ...data }) as Record<string, unknown> | unknown[];

        for (const [key, value] of Object.entries(result)) {
            if (this.isEncryptedField(value)) {
                const decrypted = this.decrypt(value as EncryptedData);
                if (decrypted) {
                    try {
                        (result as Record<string, unknown>)[key] = JSON.parse(decrypted);
                    } catch {
                        (result as Record<string, unknown>)[key] = decrypted;
                    }
                }
            } else if (typeof value === 'object' && value !== null) {
                (result as Record<string, unknown>)[key] = this.decryptFields(value);
            }
        }
        return result as T;
    }

    private shouldEncryptField(fieldName: string): boolean {
        const normalized = fieldName.toLowerCase();
        return this.config.encryptedFields?.some(field => normalized.includes(field.toLowerCase())) || false;
    }

    private isEncryptedField(value: unknown): boolean {
        const val = value as Record<string, unknown>;
        return typeof val === 'object' && val !== null && val['_encrypted'] === true && 'encrypted' in val && 'iv' in val && 'authTag' in val;
    }

    exportEncrypted(encryptedData: EncryptedData): string { return JSON.stringify(encryptedData); }

    importEncrypted(encryptedString: string): EncryptedData | null {
        try {
            return JSON.parse(encryptedString) as EncryptedData;
        } catch {
            return null;
        }
    }

    updateConfig(config: Partial<EncryptionConfig>): void {
        this.config = { ...this.config, ...config };
        if (this.config.enabled && !this.masterKey) this.initializeMasterKey();
    }

    getCurrentKeyId(): string { return this.keyId; }
}

const isServer = typeof window === 'undefined';
export const defaultEncryption = new LogEncryption({
    enabled: isServer && process.env['LOG_ENCRYPTION_ENABLED'] === 'true',
    algorithm: 'aes-256-gcm'
});

export function encryptLog(data: string | object): EncryptedData | null { return defaultEncryption.encrypt(data); }
export function decryptLog(encryptedData: EncryptedData): string | null { return defaultEncryption.decrypt(encryptedData); }
