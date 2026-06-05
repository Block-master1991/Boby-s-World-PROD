/* eslint-disable max-lines */
import { logger } from "@/utils/logger";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { getAppBaseDomain, isProd } from "./config/env";
import { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from "./server-constants";
import { TokenBlacklistManager } from "./token-blacklist";

export interface JWTPayload {
  sub: string; // Subject (user's public key)
  iat: number; // Issued at (timestamp in seconds)
  exp: number; // Expiration time (timestamp in seconds)
  jti: string; // JWT ID (unique identifier for the token)
  type: "access" | "refresh";
  nonce?: string | undefined; // Nonce used for this specific login session, tied to access token
  userAgentHash?: string | undefined;
  ipHash?: string | undefined; // Optional (can be undefined)
  authMethod?: string | undefined;
  totpEnabled?: boolean | undefined;
}

interface CreateTokenParams {
  publicKey: string;
  nonce?: string | undefined;
  userAgentHash?: string | undefined;
  ipHash?: string | undefined;
  authMethod?: string | undefined;
  totpEnabled?: boolean | undefined;
}

interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "none" | "lax" | "strict";
  maxAge: number;
  path: string;
  domain?: string;
}

export class JWTManager {
  private static verifyFingerprint(decoded: JWTPayload, userAgent: string, ip: string): boolean {
    const expectedUserAgentHash = decoded.userAgentHash || "";
    const expectedIpHash = decoded.ipHash || "";

    const actualUserAgentHash = expectedUserAgentHash
      ? createHash("sha256").update(userAgent).digest("base64")
      : "";
    const actualIpHash = expectedIpHash ? createHash("sha256").update(ip).digest("base64") : "";

    if (expectedUserAgentHash && actualUserAgentHash !== expectedUserAgentHash) {
      logger.warn(`[JWTManager] User-Agent hash mismatch for token ${decoded.jti}`);
      return false;
    }

    if (expectedIpHash && actualIpHash !== expectedIpHash) {
      logger.warn(`[JWTManager] IP hash mismatch for token ${decoded.jti}`);
      return false;
    }

    return true;
  }

  private static readonly ACCESS_TOKEN_SECRET =
    JWT_ACCESS_SECRET || "access-secret-dev-for-boby-world-app-CHANGE-IN-PROD";
  private static readonly REFRESH_TOKEN_SECRET =
    JWT_REFRESH_SECRET || "refresh-secret-dev-for-boby-world-app-CHANGE-IN-PROD";

  // Expiry times in seconds
  private static readonly ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

  static createAccessToken(params: CreateTokenParams): string {
    const { publicKey, nonce, userAgentHash, ipHash } = params;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: publicKey,
      iat: nowSeconds,
      exp: nowSeconds + this.ACCESS_TOKEN_EXPIRY_SECONDS,
      jti: randomBytes(16).toString("hex"),
      type: "access",
      nonce,
      userAgentHash,
      ipHash,
      authMethod: params.authMethod,
      totpEnabled: params.totpEnabled,
    };
    logger.log(
      `[JWTManager] Creating access token for ${publicKey}. JTI: ${payload.jti}, Nonce: ${nonce}, UA Hash: ${userAgentHash}, IP Hash: ${ipHash}`
    );
    return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, { algorithm: "HS256" });
  }

  static createRefreshToken(params: CreateTokenParams): string {
    const { publicKey, nonce, userAgentHash, ipHash } = params;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
      sub: publicKey,
      iat: nowSeconds,
      exp: nowSeconds + this.REFRESH_TOKEN_EXPIRY_SECONDS,
      jti: randomBytes(16).toString("hex"),
      type: "refresh",
      nonce,
      userAgentHash,
      ipHash,
      authMethod: params.authMethod,
      totpEnabled: params.totpEnabled,
    };
    logger.log(
      `[JWTManager] Creating refresh token for ${publicKey}. JTI: ${payload.jti}, Nonce: ${nonce}, UA Hash: ${userAgentHash}, IP Hash: ${ipHash}`
    );
    return jwt.sign(payload, this.REFRESH_TOKEN_SECRET, { algorithm: "HS256" });
  }
  private static async verifyTokenGeneric(
    token: string,
    secret: string,
    options: {
      expectedType: "access" | "refresh";
      userAgent: string;
      ip: string;
      blacklistGracePeriod?: number;
    }
  ): Promise<JWTPayload | null> {
    const { expectedType, userAgent, ip, blacklistGracePeriod = 0 } = options;
    let decodedForLog: JWTPayload | null = null;

    try {
      decodedForLog = jwt.decode(token) as JWTPayload | null;
      // const jti = decodedForLog?.jti || 'unknown_jti'; // Removed unused var

      const decoded = jwt.verify(token, secret) as JWTPayload;

      if (!(await this.validateTokenPayload(decoded, expectedType, blacklistGracePeriod))) {
        return null;
      }

      if (!this.verifyFingerprint(decoded, userAgent, ip)) return null;

      return decoded;
    } catch (error: unknown) {
      return this.handleVerificationError(error, decodedForLog, expectedType);
    }
  }

  private static async validateTokenPayload(
    decoded: JWTPayload,
    expectedType: "access" | "refresh",
    blacklistGracePeriod: number
  ): Promise<boolean> {
    if (await TokenBlacklistManager.isBlacklisted(decoded.jti, blacklistGracePeriod)) {
      logger.warn(`[JWTManager] ${expectedType} token ${decoded.jti} is blacklisted.`);
      return false;
    }

    if (decoded.type !== expectedType) {
      logger.warn(
        `[JWTManager] Invalid token type for ${decoded.jti}. Expected '${expectedType}', got '${decoded.type}'.`
      );
      return false;
    }
    return true;
  }

  private static async handleVerificationError(
    error: unknown,
    decodedForLog: JWTPayload | null,
    expectedType: string
  ): Promise<null> {
    const jti = decodedForLog?.jti || "unknown_jti_on_error";
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      `[JWTManager] ${expectedType} token verification failed. JTI: ${jti}`,
      errorMessage
    );

    if (
      error instanceof Error &&
      error.name === "TokenExpiredError" &&
      decodedForLog?.jti &&
      decodedForLog?.exp
    ) {
      await TokenBlacklistManager.addToBlacklist(decodedForLog.jti, decodedForLog.exp, "expired");
    }
    return null;
  }

  static verifyAccessToken(
    token: string,
    userAgent: string,
    ip: string
  ): Promise<JWTPayload | null> {
    return this.verifyTokenGeneric(token, this.ACCESS_TOKEN_SECRET, {
      expectedType: "access",
      userAgent,
      ip,
    });
  }

  static verifyRefreshToken(
    token: string,
    userAgent: string,
    ip: string
  ): Promise<JWTPayload | null> {
    return this.verifyTokenGeneric(token, this.REFRESH_TOKEN_SECRET, {
      expectedType: "refresh",
      userAgent,
      ip,
      blacklistGracePeriod: 30,
    });
  }

  static async revokeToken(
    token: string,
    reason: "logout" | "security_breach" | "expired" = "logout"
  ): Promise<boolean> {
    try {
      let decoded = jwt.decode(token) as JWTPayload | null;
      // If basic decode fails or is missing fields, try to verify to recover
      if (!decoded || !decoded.jti || !decoded.exp) {
        try {
          // Attempt verification with both secrets to recover payload
          decoded =
            (jwt.verify(token, this.ACCESS_TOKEN_SECRET) as JWTPayload) ||
            (jwt.verify(token, this.REFRESH_TOKEN_SECRET) as JWTPayload);
        } catch {
          /* checking both */
        }
      }

      if (decoded?.jti && decoded?.exp) {
        await TokenBlacklistManager.addToBlacklist(decoded.jti, decoded.exp, reason);
        logger.log(`[JWTManager] Revoked token ${decoded.jti} (Reason: ${reason})`);
        return true;
      }

      logger.warn("[JWTManager] Failed to identify token for revocation.");
      return false;
    } catch (error) {
      logger.error(
        "[JWTManager] Error during revocation",
        error instanceof Error ? error.message : "Unknown"
      );
      return false;
    }
  }

  static async refreshAccessToken(
    refreshTokenValue: string,
    userAgent: string,
    ip: string
  ): Promise<{ accessToken: string; newRefreshToken: string } | null> {
    logger.log(
      `[JWTManager] Attempting to refresh access token using refresh token (first 20 chars): ${refreshTokenValue.substring(0, 20)}...`
    );
    const decodedRefreshToken = await this.verifyRefreshToken(refreshTokenValue, userAgent, ip);
    if (!decodedRefreshToken) {
      logger.warn(
        "[JWTManager] Refresh token verification failed during access token refresh. Cannot proceed."
      );
      return null;
    }
    // Important: Revoke the old refresh token *after* successfully verifying it and *before* issuing new ones.
    // This prevents replay of the same refresh token if something goes wrong after this point.
    logger.log(
      `[JWTManager] Old refresh token ${decodedRefreshToken.jti} verified. Revoking it as it's being used for refresh.`
    );
    await this.revokeToken(refreshTokenValue, "expired"); // Mark as 'expired' because it's consumed

    const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("base64") : "";
    const ipHash = ip ? createHash("sha256").update(ip).digest("base64") : "";

    const newAccessToken = this.createAccessToken({
      publicKey: decodedRefreshToken.sub,
      nonce: decodedRefreshToken.nonce,
      userAgentHash,
      ipHash,
      authMethod: decodedRefreshToken.authMethod,
      totpEnabled: decodedRefreshToken.totpEnabled,
    });

    const newRefreshToken = this.createRefreshToken({
      publicKey: decodedRefreshToken.sub,
      nonce: decodedRefreshToken.nonce,
      userAgentHash,
      ipHash,
      authMethod: decodedRefreshToken.authMethod,
      totpEnabled: decodedRefreshToken.totpEnabled,
    });

    const newAccessDecoded = jwt.decode(newAccessToken) as JWTPayload | null;
    const newRefreshDecoded = jwt.decode(newRefreshToken) as JWTPayload | null;

    logger.log(`[JWTManager] New tokens generated for ${decodedRefreshToken.sub}`);
    logger.log(`→ New accessToken JTI: ${newAccessDecoded?.jti}`);
    logger.log(`→ New refreshToken JTI: ${newRefreshDecoded?.jti}`);

    return {
      accessToken: newAccessToken,
      newRefreshToken: newRefreshToken,
    };
  }

  static extractTokenFromCookies(cookies: string, tokenName: string): string | null {
    const match = cookies.match(new RegExp(`${tokenName}=([^;]+)`));
    return match && match[1] ? match[1] : null;
  }
  // maxAge is expected in seconds for cookie
  static createSecureCookieOptions(maxAgeSeconds: number, requestHost?: string) {
    let secureCookie = isProd;
    let sameSiteValue: "none" | "lax" | "strict" = isProd ? "none" : "lax";
    let cookieDomain: string | undefined = undefined;

    if (requestHost) {
      const baseDomain = getAppBaseDomain(requestHost);
      const hostWithoutPort = requestHost.split(":")[0] ?? requestHost;

      // For ngrok or other cross-origin development
      if (hostWithoutPort.includes("ngrok")) {
        secureCookie = true;
        sameSiteValue = "none";
        cookieDomain = hostWithoutPort;
      } else if (baseDomain !== "localhost") {
        // Use leading dot for cross-subdomain support in production/staging
        cookieDomain = `.${baseDomain}`;
      }
    }

    const options: CookieOptions = {
      httpOnly: true,
      secure: secureCookie,
      sameSite: sameSiteValue,
      maxAge: maxAgeSeconds,
      path: "/",
    };

    if (cookieDomain) {
      options.domain = cookieDomain;
    }

    logger.log(
      `[JWTManager] Created cookie options: HttpOnly=${options.httpOnly}, Secure=${options.secure} (isProd: ${isProd}), SameSite=${options.sameSite}, MaxAge=${options.maxAge}s, Path=${options.path}, Domain=${options.domain || "N/A"} (RequestHost: ${requestHost || "N/A"})`
    );
    return options;
  }
}
