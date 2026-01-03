/**
 * WebAuthn Transaction Signer - Digital signature for transactions
 * Provides additional security layer (Step-up Auth) for sensitive operations
 */

import { uint8ArrayToBase64url, base64urlToUint8Array } from '@/utils/base64';
import { WebAuthnUtils } from './webauthn-utils';
import { logger } from 'utils/logger';

export interface TransactionPayload {
    action: string;
    amount?: number;
    destination?: string;
    timestamp: number;
    nonce: string;
}

export class WebAuthnTransactionSigner {
    /**
     * Generate custom challenge for signing a specific transaction
     * Transaction data is embedded in the Challenge to ensure it cannot be tampered with
     */
    public static generateTransactionChallenge(payload: TransactionPayload): string {
        const payloadString = JSON.stringify(payload);
        // Combine transaction data with random nonce to create unique challenge
        return uint8ArrayToBase64url(Buffer.from(`${payload.nonce}:${payloadString}`));
    }

    /**
     * Request signature from user for specific device with explanatory message
     * Shows to user in browser: "Sign operation: Transfer 100 coins"
     */
    public static async signTransaction(
        payload: TransactionPayload,
        credentialIds?: string[]
    ): Promise<PublicKeyCredential | null> {
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
            throw new Error('WebAuthn is not supported in this environment');
        }

        const challenge = this.generateTransactionChallenge(payload);
        const rpId = window.location.hostname === 'localhost' ? 'localhost' : WebAuthnUtils.getRPID(window.location.hostname);

        try {
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: base64urlToUint8Array(challenge) as any,
                    rpId: rpId,
                    allowCredentials: credentialIds?.map(id => ({
                        id: base64urlToUint8Array(id) as any,
                        type: 'public-key'
                    })),
                    userVerification: 'required',
                }
            }) as PublicKeyCredential;

            return credential;
        } catch (error) {
            logger.error('[TransactionSigner] Error signing transaction:', error);
            return null;
        }
    }
}
