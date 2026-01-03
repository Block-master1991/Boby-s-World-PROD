
import { logger } from './logger';
import CryptoJS from 'crypto-js';

// Secret key for client-side encryption.
const SECRET_PASSPHRASE = process.env.NEXT_PUBLIC_GAME_ENCRYPTION_KEY || 'default-secure-key-boby-world-2025';

// 1. Derive a 256-bit key from the passphrase using SHA-256
// This ensures we are using AES-256
const ENCRYPTION_KEY = CryptoJS.SHA256(SECRET_PASSPHRASE);

// 2. Derive a separate key for HMAC integrity check
const HMAC_KEY = CryptoJS.SHA256(SECRET_PASSPHRASE + 'integrity');

export const encryptData = (data: any): string => {
    try {
        const jsonString = JSON.stringify(data);

        // Generate a random IV (Initialization Vector) for semantic security
        const iv = CryptoJS.lib.WordArray.random(16);

        // Encrypt using AES-256 (since Key is 256-bit)
        const encrypted = CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        const ciphertext = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
        const ivString = iv.toString(CryptoJS.enc.Base64);

        // Combine IV and Ciphertext
        const payload = `${ivString}:${ciphertext}`;

        // 3. Calculate HMAC-SHA256 signature for integrity
        const signature = CryptoJS.HmacSHA256(payload, HMAC_KEY).toString(CryptoJS.enc.Base64);

        // Return format: IV:Ciphertext:Signature
        return `${payload}:${signature}`;
    } catch (error) {
        logger.error('Encryption failed:', error);
        return '';
    }
};

export const decryptData = (encryptedString: string): any => {
    try {
        // Expected format: IV:Ciphertext:Signature
        const parts = encryptedString.split(':');
        if (parts.length !== 3) return null;

        const [ivString, ciphertext, signature] = parts;
        const payload = `${ivString}:${ciphertext}`;

        // 1. Verify HMAC-SHA256 Signature (Integrity Check)
        const expectedSignature = CryptoJS.HmacSHA256(payload, HMAC_KEY).toString(CryptoJS.enc.Base64);
        if (signature !== expectedSignature) {
            logger.error('Data integrity check failed! Data may have been tampered with.');
            return null;
        }

        // 2. Decrypt
        const iv = CryptoJS.enc.Base64.parse(ivString);
        const decryptedBytes = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(ciphertext) } as CryptoJS.lib.CipherParams,
            ENCRYPTION_KEY,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedString) return null;

        return JSON.parse(decryptedString);
    } catch (error) {
        logger.error('Decryption failed:', error);
        return null;
    }
};
