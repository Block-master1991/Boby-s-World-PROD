/**
 * Local KMS Provider
 * Local implementation of KMS using Web Crypto API
 */

import type { KMSProvider } from './KMSProvider';

export class LocalKMSProvider implements KMSProvider {
    public readonly name = 'LocalWebCrypto';
    public readonly isHardwareBacked = false;

    async generateKey(algorithm: AesKeyGenParams): Promise<CryptoKey> {
        return crypto.subtle.generateKey(
            algorithm,
            true, // Extractable in local version as Backup
            ['encrypt', 'decrypt']
        );
    }

    async encrypt(key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv } as AesGcmParams,
            key,
            data as any
        );

        // Combine IV with encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return combined.buffer;
    }

    async decrypt(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
        const view = new Uint8Array(data);
        const iv = view.slice(0, 12);
        const ciphertext = view.slice(12);

        return crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
    }

    async securelyClearKey(key: CryptoKey): Promise<void> {
        // In local environment we only remove references
        (key as any) = null;
    }

    async validateIntegrity(key: CryptoKey): Promise<boolean> {
        try {
            const testData = new Uint8Array(16);
            crypto.getRandomValues(testData);
            const encrypted = await this.encrypt(key, testData);
            const decrypted = await this.decrypt(key, encrypted);
            return Buffer.from(decrypted).equals(Buffer.from(testData));
        } catch (error) {
            return false;
        }
    }
}
