/**
 * Base64URL Browser-Safe Utilities
 * Provides encoding and decoding for base64url that works in all browsers
 * without relying on Buffer.from(..., 'base64url') support.
 */

/**
 * Converts a base64url string to a Uint8Array (Buffer equivalent in browser)
 */
export function base64urlToUint8Array(base64url: string): Uint8Array {
    // Convert base64url to base64
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if necessary
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);

    // Decode base64
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Converts a Uint8Array or Buffer to a base64url string
 */
export function uint8ArrayToBase64url(bytes: Uint8Array | Buffer): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    // Encode to base64
    const base64 = btoa(binary);

    // Convert base64 to base64url
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Safe version of Buffer.from(str, 'base64url') that works in browser
 */
export function safeBufferFromBase64url(base64url: string): Buffer {
    // In browser, Buffer exists but might not support 'base64url'
    // We decode it manually to Uint8Array and then let Buffer wrap it
    return Buffer.from(base64urlToUint8Array(base64url));
}
