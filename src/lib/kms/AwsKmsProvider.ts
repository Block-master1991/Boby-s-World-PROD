/**
 * AWS KMS Provider
 * Actual implementation for connecting to AWS Key Management Service
 * Uses Envelope Encryption:
 * 1. KMS generates Data Encryption Key (DEK)
 * 2. Encryption is done locally using DEK for high performance (Zero Network Latency for encrypt/decrypt)
 */

import { logger } from "@/utils/logger";
import { GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";
import type { KMSProvider } from './KMSProvider';

export class AwsKmsProvider implements KMSProvider {
    public readonly name = 'AWS_KMS';
    public readonly isHardwareBacked = true;
    private client: KMSClient;
    private keyId: string;

    constructor(config: { region: string; accessKeyId?: string; secretAccessKey?: string; keyId: string }) {
        this.keyId = config.keyId;

        const clientConfig: {
            region: string;
            credentials?: { accessKeyId: string; secretAccessKey: string };
        } = {
            region: config.region
        };

        // Explicit credentials if provided (otherwise uses default chain)
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            };
        }

        this.client = new KMSClient(clientConfig);
        logger.log(`[AwsKmsProvider] Initialized for region ${config.region} with KeyID ${config.keyId}`);
    }

    /**
     * Generate Data Key (DEK) from KMS
     */
    async generateKey(algorithm: AesKeyAlgorithm): Promise<CryptoKey> {
        try {
            logger.log('[AwsKmsProvider] Generating data key via AWS KMS...');
            const command = new GenerateDataKeyCommand({
                KeyId: this.keyId,
                KeySpec: 'AES_256'
            });

            const response = await this.client.send(command);

            if (!response.Plaintext) {
                throw new Error('KMS did not return Plaintext key');
            }

            // Import raw key as WebCrypto Key for local use
            return await crypto.subtle.importKey(
                'raw',
                response.Plaintext as unknown as BufferSource,
                algorithm,
                true, // Extractable (because we may need to store it encrypted later)
                ['encrypt', 'decrypt']
            );

        } catch (error) {
            logger.error('[AwsKmsProvider] Error generating key:', error);
            throw new Error('Failed to generate key from AWS KMS');
        }
    }

    /**
     * Encryption is done locally using Data Key (High Performance)
     */
    async encrypt(key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer> {
        // Use random IV for each encryption operation
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            data as unknown as BufferSource
        );

        // Combine IV with encrypted data
        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);

        return result.buffer;
    }

    /**
     * Decryption is done locally
     */
    decrypt(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
        const dataArray = new Uint8Array(data);
        const iv = dataArray.slice(0, 12);
        const ciphertext = dataArray.slice(12);

        return crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
    }

    securelyClearKey(key: CryptoKey): Promise<void> {
        // WebCrypto keys are managed by the JS engine, but we notify logging
        logger.log(`[AwsKmsProvider] Key usage completed for key type: ${key.algorithm}. Ensure garbage collection removes reference.`);
        return Promise.resolve();
    }

    async validateIntegrity(key: CryptoKey): Promise<boolean> {
        // Cannot verify local key with AWS directly after generation
        // But we can do quick local check
        try {
            const testData = new TextEncoder().encode('integrity-check');
            const encrypted = await this.encrypt(key, testData);
            const decrypted = await this.decrypt(key, encrypted);
            const decoded = new TextDecoder().decode(decrypted);
            return decoded === 'integrity-check';
        } catch {
            return false;
        }
    }
}
