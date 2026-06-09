import * as jose from "jose";

const JWT_ACCESS_SECRET =
  process.env["JWT_ACCESS_SECRET"] || "access-secret-dev-for-boby-world-app-CHANGE-IN-PROD";

export interface EdgeJWTPayload extends jose.JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  type: "access" | "refresh";
  nonce?: string;
  userAgentHash?: string;
  ipHash?: string;
}

export class EdgeJWTManager {
  private static readonly ACCESS_SECRET = new TextEncoder().encode(JWT_ACCESS_SECRET);

  /**
   * Verify an access token at the Edge.
   */
  static async verifyAccessToken(token: string): Promise<EdgeJWTPayload | null> {
    try {
      const { payload } = await jose.jwtVerify(token, this.ACCESS_SECRET);

      // Basic validation of Boby World specialized fields
      if (payload["type"] !== "access") {
        return null;
      }

      return payload as EdgeJWTPayload;
    } catch {
      return null;
    }
  }

  /**
   * Simple fingerprint verification for Edge.
   */
  static async verifyFingerprint(
    payload: EdgeJWTPayload,
    userAgent: string,
    ip: string
  ): Promise<boolean> {
    const expectedUA = payload.userAgentHash || "";
    const expectedIP = payload.ipHash || "";

    if (!expectedUA && !expectedIP) return true;

    // Use Web Crypto for hashing in Edge environment
    if (expectedUA) {
      const uaHash = await this.hashString(userAgent);
      if (uaHash !== expectedUA) return false;
    }

    if (expectedIP) {
      const ipHash = await this.hashString(ip);
      if (ipHash !== expectedIP) return false;
    }

    return true;
  }

  private static async hashString(str: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode.apply(null, hashArray));
  }
}
