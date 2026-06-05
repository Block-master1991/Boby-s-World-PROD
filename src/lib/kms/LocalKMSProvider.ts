/**
 * Local KMS Provider
 * Local implementation of KMS using Web Crypto API
 */

import { webcrypto } from "node:crypto";
import type { KMSProvider } from "./KMSProvider";

const getCrypto = () => {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  return webcrypto as unknown as Crypto;
};

const cryptoAPI = getCrypto();

export class LocalKMSProvider implements KMSProvider {
  public readonly name = "LocalWebCrypto";
  public readonly isHardwareBacked = false;

  generateKey(algorithm: AesKeyGenParams): Promise<CryptoKey> {
    return cryptoAPI.subtle.generateKey(
      algorithm,
      true, // Extractable in local version as Backup
      ["encrypt", "decrypt"]
    );
  }

  async encrypt(key: CryptoKey, data: Uint8Array): Promise<ArrayBuffer> {
    const iv = cryptoAPI.getRandomValues(new Uint8Array(12));
    const encrypted = await cryptoAPI.subtle.encrypt(
      { name: "AES-GCM", iv } as AesGcmParams,
      key,
      data as unknown as BufferSource
    );

    // Combine IV with encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return combined.buffer;
  }

  decrypt(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
    const view = new Uint8Array(data);
    const iv = view.slice(0, 12);
    const ciphertext = view.slice(12);

    return cryptoAPI.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  }

  async securelyClearKey(key: CryptoKey): Promise<void> {
    // In local environment we cannot explicit zero-fill memory for JS objects
    // Reference dropping is handled by caller/GC
    await Promise.resolve(key); // Ensure async/await usage and key usage
  }

  async validateIntegrity(key: CryptoKey): Promise<boolean> {
    try {
      const testData = new Uint8Array(16);
      cryptoAPI.getRandomValues(testData);
      const encrypted = await this.encrypt(key, testData);
      const decrypted = await this.decrypt(key, encrypted);
      return Buffer.from(decrypted).equals(Buffer.from(testData));
    } catch {
      return false;
    }
  }
}
