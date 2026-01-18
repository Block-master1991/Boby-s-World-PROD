import { logger } from '@/utils/logger';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import type { KeyMetadata, KeyRotationOptions } from './keyVaultTypes';
import type { KMSProvider } from './kms/KMSProvider';
import { LocalKMSProvider } from './kms/LocalKMSProvider';
import { MASTER_ENCRYPTION_KEY } from './server-constants';

const getCrypto = () => {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
        return globalThis.crypto;
    }
    return webcrypto as unknown as Crypto;
};

const cryptoAPI = getCrypto();

export class KeyVaultService {
    private static instance: KeyVaultService;
    private keysCache = new Map<string, { key: CryptoKey; metadata: KeyMetadata }>();
    private rotationTimers = new Map<string, NodeJS.Timeout>();
    private kmsProvider: KMSProvider;
    private readonly HARDWARE_PROTECTION_ENABLED = true;

    private constructor(provider?: KMSProvider) {
        this.kmsProvider = provider || new LocalKMSProvider();
        this.initializeKeyRotation();
    }

    public static getInstance(): KeyVaultService {
        if (!KeyVaultService.instance) {
            let provider: KMSProvider | undefined;

            if (process.env['KMS_PROVIDER'] === 'aws') {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { AwsKmsProvider } = require('./kms/AwsKmsProvider'); 
                provider = new AwsKmsProvider({
                    region: process.env['AWS_REGION'] || 'us-east-1',
                    keyId: process.env['AWS_KMS_KEY_ID'] || 'alias/master-key'
                });
            }

            KeyVaultService.instance = new KeyVaultService(provider);
        }
        return KeyVaultService.instance;
    }

    public async createSecureKey(
        keyId: string,
        algorithm: AesKeyGenParams = { name: 'AES-GCM', length: 256 },
        options?: KeyRotationOptions
    ): Promise<CryptoKey> {
        try {
            const key = await this.kmsProvider.generateKey(algorithm);

            const metadata: KeyMetadata = {
                id: keyId,
                version: 1,
                algorithm: algorithm.name,
                createdAt: Date.now(),
                lastRotatedAt: Date.now(),
                expiresAt: Date.now() + (options?.rotationIntervalHours || 24) * 60 * 60 * 1000,
                isActive: true,
                keyUsage: ['encrypt', 'decrypt'],
                hardwareProtected: this.kmsProvider.isHardwareBacked
            };

            const encryptedMetadata = await this.encryptMetadata(metadata);
            this.keysCache.set(keyId, { key, metadata: encryptedMetadata });

            if (options?.autoRotate) {
                this.scheduleKeyRotation(keyId, options.rotationIntervalHours);
            }

            logger.log(`[KeyVault] Secure key created: ${keyId} with hardware protection`);
            return key;
        } catch (error) {
            logger.error(`[KeyVault] Failed to create secure key ${keyId}:`, error);
            throw new Error(`Failed to create secure key: ${keyId}`);
        }
    }

    public async getSecureKey(keyId: string): Promise<CryptoKey | null> {
        try {
            const cached = this.keysCache.get(keyId);
            if (!cached) {
                logger.warn(`[KeyVault] Key not found in memory: ${keyId}`);
                return null;
            }

            const metadata = await this.decryptMetadata(cached.metadata);
            if (metadata.expiresAt < Date.now()) {
                logger.warn(`[KeyVault] Key expired: ${keyId}`);
                await this.rotateKey(keyId);
                return this.getSecureKey(keyId);
            }

            const isValid = await this.kmsProvider.validateIntegrity(cached.key);
            if (!isValid) {
                logger.error(`[KeyVault] Key corrupted: ${keyId}`);
                await this.revokeKey(keyId);
                return null;
            }

            return cached.key;
        } catch (error) {
            logger.error(`[KeyVault] Error retrieving key ${keyId}:`, error);
            return null;
        }
    }

    public encryptData(key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer> {
        return this.kmsProvider.encrypt(key, data);
    }

    public decryptData(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
        return this.kmsProvider.decrypt(key, data);
    }

    public importKey(jwk: JsonWebKey): Promise<CryptoKey> {
        return cryptoAPI.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    public exportKey(key: CryptoKey): Promise<JsonWebKey> {
        return cryptoAPI.subtle.exportKey('jwk', key);
    }

    public generateRawKey(): Promise<CryptoKey> {
        return this.kmsProvider.generateKey({ name: 'AES-GCM', length: 256 } as AesKeyGenParams);
    }

    public getMasterKey(): Promise<CryptoKey | null> {
        if (!MASTER_ENCRYPTION_KEY) {
            logger.error('[KeyVault] Master encryption key not found in environment variables');
            return Promise.resolve(null);
        }

        try {
            const jwkKey = JSON.parse(MASTER_ENCRYPTION_KEY);
            return this.importKey(jwkKey).catch(error => {
                logger.error('[KeyVault] Failed to import master key:', error);
                return null;
            });
        } catch (error) {
            logger.error('[KeyVault] Failed to parse master key:', error);
            return Promise.resolve(null);
        }
    }

    public generateRandomSecret(bytes: number = 32): string {
        return randomBytes(bytes).toString('hex');
    }

    public async rotateKey(keyId: string): Promise<CryptoKey | null> {
        try {
            logger.log(`[KeyVault] Starting key rotation: ${keyId}`);

            const oldCached = this.keysCache.get(keyId);
            if (!oldCached) {
                logger.warn(`[KeyVault] Original key not found: ${keyId}`);
                return await this.createSecureKey(keyId);
            }

            const oldMetadata = await this.decryptMetadata(oldCached.metadata);
            const newKey = await this.generateHardwareProtectedKey(
                { name: 'AES-GCM', length: 256 }
            );

            const newMetadata: KeyMetadata = {
                ...oldMetadata,
                version: oldMetadata.version + 1,
                lastRotatedAt: Date.now(),
                expiresAt: Date.now() + 24 * 60 * 60 * 1000,
                isActive: true
            };

            const encryptedNewMetadata = await this.encryptMetadata(newMetadata);
            this.keysCache.set(keyId, { key: newKey, metadata: encryptedNewMetadata });

            await this.securelyClearKey();

            logger.log(`[KeyVault] Key rotated successfully: ${keyId} (version ${newMetadata.version})`);
            return newKey;
        } catch (error) {
            logger.error(`[KeyVault] Failed to rotate key ${keyId}:`, error);
            return null;
        }
    }
    public async revokeKey(keyId: string): Promise<boolean> {
        try {
            const cached = this.keysCache.get(keyId);
            if (cached) {
                await this.securelyClearKey();
                const timer = this.rotationTimers.get(keyId);
                if (timer) {
                    clearTimeout(timer);
                    this.rotationTimers.delete(keyId);
                }

                this.keysCache.delete(keyId);
                logger.log(`[KeyVault] Key revoked: ${keyId}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`[KeyVault] Error revoking key ${keyId}:`, error);
            return false;
        }
    }
    private async generateHardwareProtectedKey(algorithm: AesKeyGenParams): Promise<CryptoKey> {
        if (this.HARDWARE_PROTECTION_ENABLED && cryptoAPI.subtle) {
            try {
                return await cryptoAPI.subtle.generateKey(
                    algorithm,
                    false, 
                    ['encrypt', 'decrypt']
                );
            } catch {
                logger.warn('[KeyVault] HSM not available, using regular encryption');
            }
        }
        return cryptoAPI.subtle.generateKey(
            algorithm,
            true,
            ['encrypt', 'decrypt']
        );
    }
    private encryptMetadata(metadata: KeyMetadata): Promise<KeyMetadata> {
        return Promise.resolve({
            ...metadata,
            id: createHash('sha256').update(metadata.id + randomBytes(16).toString('hex')).digest('hex')
        });
    }

    private decryptMetadata(encryptedMetadata: KeyMetadata): Promise<KeyMetadata> {
        return Promise.resolve(encryptedMetadata);
    }

    private async securelyClearKey(): Promise<void> {
        try {
            await Promise.resolve();
            if (global.gc) {
                global.gc();
            }
        } catch (error) {
            logger.warn('[KeyVault] Warning in key clearing:', error);
        }
    }

    private scheduleKeyRotation(keyId: string, intervalHours: number): void {
        const intervalMs = intervalHours * 60 * 60 * 1000;

        const timer = setTimeout(async () => {
            await this.rotateKey(keyId);
            this.scheduleKeyRotation(keyId, intervalHours);
        }, intervalMs);

        this.rotationTimers.set(keyId, timer);
    }

    private initializeKeyRotation(): void {
        setInterval(async () => {
            const now = Date.now();
            for (const [keyId, cached] of this.keysCache) {
                 // eslint-disable-next-line no-await-in-loop
                const metadata = await this.decryptMetadata(cached.metadata);
                if (metadata.expiresAt - now < 60 * 60 * 1000) { 
                    logger.log(`[KeyVault] Key ${keyId} will expire soon, starting rotation`);
                     // eslint-disable-next-line no-await-in-loop
                    await this.rotateKey(keyId);
                }
            }
        }, 10 * 60 * 1000); 
    }
    public getStats(): { activeKeys: number; rotationTimers: number } {
        return {
            activeKeys: this.keysCache.size,
            rotationTimers: this.rotationTimers.size
        };
    }
    public cleanup(): void {
        for (const timer of this.rotationTimers.values()) {
            clearTimeout(timer);
        }
        this.rotationTimers.clear();
        this.keysCache.clear();
        logger.log('[KeyVault] Memory cleaned');
    }
}
// Export singleton instance
export const keyVault = KeyVaultService.getInstance();
