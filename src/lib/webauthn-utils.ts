import { logger } from "@/utils/logger";
import { createHash, randomBytes } from "crypto";
import { getAppBaseDomain } from "./config/env";

// Authenticator Metadata Mapping (MDS) - List of some popular device definitions
const AUTHENTICATOR_METADATA: Record<string, string> = {
  "ad10fa37-abd9-4113-b4cd-32221588640f": "Apple iCloud Keychain",
  "00000000-0000-0000-0000-000000000000": "Local Device (Windows Hello / Mac TouchID)",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cbcd211": "YubiKey 5 Series",
  "f8a011f3-cd88-4537-ba1b-ccce86640391": "Google Titan Security Key",
  "7731a683-d560-498c-843e-c6891ebac848": "Samsung Biometric Authenticator",
  "423d1832-1590-48cf-927a-e490e668853b": "Android Biometric",
};

export interface WebAuthnCredential {
  id: string; // base64url encoded credentialID
  publicKey: string; // base64url encoded publicKey
  counter: number;
  transports?: string[];
  userId: string;
}

export interface AuthenticatorAssertionResponse {
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  userHandle?: string;
}

export class WebAuthnUtils {
  /**
   * Generate challenge for registration process
   */
  public static generateRegistrationChallenge(
    userId: string,
    userName: string,
    rpId: string = "localhost"
  ) {
    const challenge = randomBytes(32).toString("base64url");
    return {
      challenge,
      rp: {
        name: "Boby's World",
        id: rpId,
      },
      user: {
        id: Buffer.from(userId).toString("base64url"),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      timeout: 60000,
      attestation: "none" as AttestationConveyancePreference,
      authenticatorSelection: {
        userVerification: "preferred" as UserVerificationRequirement,
        residentKey: "required" as ResidentKeyRequirement,
      },
    };
  }

  /**
   * Translate AAGUID to known device commercial name
   */
  public static getAuthenticatorName(aaguid?: string): string {
    if (!aaguid || aaguid === "00000000-0000-0000-0000-000000000000") return "Standard Biometric";
    return AUTHENTICATOR_METADATA[aaguid] || "WebAuthn Device";
  }

  /**
   * Extract AAGUID from AuthData (simplified)
   */
  public static extractAAGUID(authData: string): string {
    try {
      const buffer = Buffer.from(authData, "base64url");
      // AAGUID starts from byte 37 with length 16 bytes in registration AuthData
      if (buffer.length < 53) return "00000000-0000-0000-0000-000000000000";

      const aaguidBuffer = buffer.slice(37, 53);
      const hex = aaguidBuffer.toString("hex");

      // Convert HEX to UUID format: 8-4-4-4-12
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      return "00000000-0000-0000-0000-000000000000";
    }
  }

  /**
   * Get Relying Party ID - supports subdomains
   */
  public static getRPID(host: string): string {
    return getAppBaseDomain(host);
  }

  /**
   * Generate challenge for login process
   */
  public static generateAuthenticationChallenge(rpId: string = "localhost") {
    return {
      challenge: randomBytes(32).toString("base64url"),
      timeout: 60000,
      rpId: rpId,
      userVerification: "required" as UserVerificationRequirement,
    };
  }

  /**
   * Verify assertion response - real verification using Node.js crypto
   */
  public static async verifyAuthenticationResponse(
    credential: WebAuthnCredential,
    response: AuthenticatorAssertionResponse,
    expectedChallenge: string,
    expectedOrigin: string
  ): Promise<boolean> {
    try {
      logger.log(`[WebAuthn] Verifying device response for user: ${credential.userId}`);

      const { authenticatorData, clientDataJSON, signature } = response;
      if (!signature || !authenticatorData || !clientDataJSON) {
        logger.error("[WebAuthn] Response fields missing");
        return false;
      }

      // 1. Verify Client Data
      const clientDataValid = this.verifyClientData(
        clientDataJSON,
        expectedChallenge,
        expectedOrigin
      );
      if (!clientDataValid) return false;

      // 2. Prepare verification data
      const clientDataHash = this.hashClientDataJSON(clientDataJSON);
      const authDataBuffer = Buffer.from(authenticatorData, "base64url");
      const verifyData = Buffer.concat([authDataBuffer, clientDataHash]);

      // 3. Verify digital signature
      return await this.verifySignature(verifyData, signature, credential.publicKey);
    } catch (error) {
      logger.error("[WebAuthn] Cryptographic verification error:", error);
      return false;
    }
  }

  private static verifyClientData(
    clientDataJSON: string,
    expectedChallenge: string,
    expectedOrigin: string
  ): boolean {
    const rawClientData = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString());

    if (rawClientData.challenge !== expectedChallenge) {
      logger.error("[WebAuthn] Challenge does not match");
      return false;
    }

    if (expectedOrigin && !expectedOrigin.includes(rawClientData.origin)) {
      logger.warn(
        `[WebAuthn] Warning: Request origin ${rawClientData.origin} does not match expected ${expectedOrigin}`
      );
    }
    return true;
  }

  private static async verifySignature(
    verifyData: Buffer,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    const sigBuffer = Buffer.from(signature, "base64url");
    const pubKeyBuffer = Buffer.from(publicKey, "base64url");
    const crypto = await import("crypto");

    try {
      const isVerified = crypto.verify(
        "sha256",
        verifyData,
        {
          key: pubKeyBuffer,
          format: "der",
          type: "spki",
        },
        sigBuffer
      );

      logger.log(`[WebAuthn] Cryptographic verification result: ${isVerified}`);
      return isVerified;
    } catch (verifyError) {
      logger.error("[WebAuthn] crypto.verify failed:", verifyError);
      return false;
    }
  }

  /**
   * Create SHA-256 Hash for clientDataJSON
   * Basic requirement in FIDO2 specifications for signature verification
   */
  private static hashClientDataJSON(clientDataJSON: string): Buffer {
    // clientDataJSON is usually base64url encoded from the client
    const rawJSON = Buffer.from(clientDataJSON, "base64url");
    return createHash("sha256").update(rawJSON).digest();
  }
}
