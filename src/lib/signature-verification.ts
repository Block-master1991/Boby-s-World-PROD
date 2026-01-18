
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { logger } from 'utils/logger';

/**
 * Verifies a cryptographic signature for a given payload.
 * Used for "Signed Actions" in high-security admin routes.
 *
 * @param content - The raw content that was signed (e.g., timestamp + body)
 * @param signature - The signature string (Base58 encoded)
 * @param publicKey - The signer's public key (Base58 encoded)
 * @returns boolean - True if valid, false otherwise
 */
export function verifySignature(content: string, signature: string, publicKey: string): boolean {
    try {
        const messageBytes = new TextEncoder().encode(content);
        const signatureBytes = bs58.decode(signature);
        const publicKeyBytes = bs58.decode(publicKey);

        return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
        logger.error('[SignatureVerification] Error verifying signature:', error);
        return false;
    }
}

/**
 * Constructs the canonical message string to be signed.
 * Format: "timestamp.body_json_string"
 */
export function constructSignedMessage(timestamp: string, body: unknown): string {
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    return `${timestamp}.${bodyString}`;
}
