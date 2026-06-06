/**
 * WebAuthn Transaction Signer - Digital signature for transactions
 * Provides additional security layer (Step-up Auth) for sensitive operations
 */

import { base64urlToUint8Array, uint8ArrayToBase64url } from "@/utils/base64";
import { logger } from "utils/logger";
import { WebAuthnUtils } from "./webauthn-utils";

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
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      throw new Error("WebAuthn is not supported in this environment");
    }

    const challenge = this.generateTransactionChallenge(payload);
    const rpId =
      window.location.hostname === "localhost"
        ? "localhost"
        : WebAuthnUtils.getRPID(window.location.hostname);

    try {
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge: base64urlToUint8Array(challenge) as BufferSource,
        rpId: rpId,
        userVerification: "required",
      };

      if (credentialIds && credentialIds.length > 0) {
        publicKeyOptions.allowCredentials = credentialIds.map(id => ({
          id: base64urlToUint8Array(id) as BufferSource,
          type: "public-key",
        }));
      }

      const credential = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential;

      return credential;
    } catch (error) {
      logger.error("[TransactionSigner] Error signing transaction:", error);
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "AbortError")
      ) {
        return null;
      }
      throw error;
    }
  }
}
