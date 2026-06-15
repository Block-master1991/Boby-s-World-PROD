/* eslint-disable max-lines */
import { logger } from "@/utils/logger";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { getAppBaseDomain, isProd } from "../config/env";
import { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from "../server-constants";
import { TokenBlacklistManager } from "../token-blacklist";

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

/**
 * Minimal Redis client surface used by the refresh flow. We avoid importing
 * the full ioredis type to keep this module decoupled from the cache layer.
 */
type RedisLike = {
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<number>;
};

export class JWTManager {
  private static verifyFingerprint(decoded: JWTPayload, userAgent: string, ip: string): boolean {
    const expectedUserAgentHash = decoded.userAgentHash || "";
    const expectedIpHash = decoded.ipHash || "";

    const actualUserAgentHash = expectedUserAgentHash
      ? createHash("sha256").update(userAgent).digest("base64")
      : "";
    const actualIpHash = expectedIpHash ? createHash("sha256").update(ip).digest("base64") : "";

    // User-Agent mismatch is a strong signal of token theft — reject.
    if (expectedUserAgentHash && actualUserAgentHash !== expectedUserAgentHash) {
      logger.warn(`[JWTManager] User-Agent hash mismatch for token ${decoded.jti}`);
      return false;
    }

    // IP changes are common on mobile (network switches, dynamic NAT, VPN).
    // We audit-log the change but do NOT reject — the token is still valid.
    // The session layer (advancedSessionManager) provides additional device binding.
    if (expectedIpHash && actualIpHash !== expectedIpHash) {
      logger.warn(
        `[JWTManager] IP changed for token ${decoded.jti}. Expected hash differs from current IP. ` +
        `Allowing — will be captured in audit logs. (Mobile/NAT roaming is normal)`
      );
      // Intentionally not returning false; IP-only changes are not a blocking signal.
    }

    return true;
  }

  private static get ACCESS_TOKEN_SECRET(): string {
    const secret = JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        "[FATAL] JWT_ACCESS_SECRET is not set or too short (minimum 32 characters). " +
        "Set it in your environment variables."
      );
    }
    return secret;
  }
  private static get REFRESH_TOKEN_SECRET(): string {
    const secret = JWT_REFRESH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        "[FATAL] JWT_REFRESH_SECRET is not set or too short (minimum 32 characters). " +
        "Set it in your environment variables."
      );
    }
    return secret;
  }

  // Expiry times in seconds
  private static readonly ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
  // Active-game extension applied to access tokens and cookies. Refresh
  // tokens are NOT extended — they already last 7 days, and stretching them
  // would weaken the rotation guarantee.
  private static readonly ACTIVE_USER_TOKEN_EXTENSION = 5 * 60; // +5 minutes

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

  /**
   * Refreshes the access token using a valid refresh token.
   *
   * - When `isActiveUser` is true the new access token is granted an extra
   *   `ACTIVE_USER_TOKEN_EXTENSION` window. The refresh token's lifetime is
   *   NOT extended (it already lasts 7 days).
   * - Results are cached in Redis (double-checked locking) so concurrent
   *   refreshes from multiple tabs collapse into a single token rotation.
   */
  static async refreshAccessToken(
    refreshTokenValue: string,
    userAgent: string,
    ip: string,
    isActiveUser: boolean = false
  ): Promise<{ accessToken: string; newRefreshToken: string } | null> {
    logger.log(
      `[JWTManager] Attempting to refresh access token using refresh token (first 20 chars): ${refreshTokenValue.substring(0, 20)}...`
    );

    const decoded = jwt.decode(refreshTokenValue) as JWTPayload | null;
    const jti = decoded?.jti;
    const lockKey = jti ? `lock:refresh:${jti}` : null;
    const cacheKey = jti ? `refreshed:jti:${jti}` : null;
    const lockValue = randomBytes(16).toString("hex");
    const redis: RedisLike | null = await this.tryConnectRedis();
    const lockCtx = { redis, cacheKey, lockKey, lockValue, jti };

    const deduped = await this.dedupeOrAcquireLock(lockCtx);
    if (deduped.cached) return JSON.parse(deduped.cached);

    try {
      return await this.issueNewTokens({
        refreshTokenValue,
        userAgent,
        ip,
        isActiveUser,
        redis,
        cacheKey,
        jti,
      });
    } finally {
      if (deduped.lockAcquired && lockKey && redis) {
        await this.releaseLock(redis, lockKey, lockValue, jti);
      }
    }
  }

  /**
   * Double-checked locking: read cache → acquire lock → re-read cache.
   * Returns the cached payload (if any) and whether the lock was held.
   */
  private static async dedupeOrAcquireLock(ctx: {
    redis: RedisLike | null;
    cacheKey: string | null;
    lockKey: string | null;
    lockValue: string;
    jti: string | undefined;
  }): Promise<{ cached: string | null; lockAcquired: boolean }> {
    const { redis, cacheKey, lockKey, lockValue, jti } = ctx;

    if (redis && cacheKey) {
      const cached = await this.readCachedRefresh(redis, cacheKey, jti);
      if (cached) {
        logger.log(`[JWTManager] Found cached refresh tokens for JTI: ${jti}. Returning deduplicated result.`);
        return { cached, lockAcquired: false };
      }
    }

    let lockAcquired = false;
    if (redis && lockKey) {
      try {
        lockAcquired = await this.acquireRefreshLock(redis, lockKey, lockValue);
        if (!lockAcquired) {
          logger.warn(`[JWTManager] Timeout waiting for refresh lock on token ${jti}. Proceeding without lock.`);
        }
      } catch (err) {
        logger.error(`[JWTManager] Error acquiring lock for JTI: ${jti}`, err);
      }
    }

    if (redis && cacheKey) {
      const cached = await this.readCachedRefresh(redis, cacheKey, jti);
      if (cached) {
        logger.log(
          `[JWTManager] Found cached refresh tokens for JTI: ${jti} after acquiring lock. Returning deduplicated result.`
        );
        return { cached, lockAcquired };
      }
    }

    return { cached: null, lockAcquired };
  }

  /**
   * Verifies the supplied refresh token, revokes it, and mints a new pair.
   * Optionally extends the access-token TTL when `isActiveUser` is true.
   */
  private static async issueNewTokens(ctx: {
    refreshTokenValue: string;
    userAgent: string;
    ip: string;
    isActiveUser: boolean;
    redis: RedisLike | null;
    cacheKey: string | null;
    jti: string | undefined;
  }): Promise<{ accessToken: string; newRefreshToken: string } | null> {
    const { refreshTokenValue, userAgent, ip, isActiveUser, redis, cacheKey, jti } = ctx;

    const decodedRefreshToken = await this.verifyRefreshToken(refreshTokenValue, userAgent, ip);
    if (!decodedRefreshToken) {
      logger.warn(
        "[JWTManager] Refresh token verification failed during access token refresh. Cannot proceed."
      );
      return null;
    }

    // Revoke the old refresh token AFTER verifying it and BEFORE issuing new
    // ones. This prevents replay of the same refresh token if something goes
    // wrong after this point.
    logger.log(
      `[JWTManager] Old refresh token ${decodedRefreshToken.jti} verified. Revoking it as it's being used for refresh.`
    );
    await this.revokeToken(refreshTokenValue, "expired");

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sharedFields = this.buildSharedTokenFields(decodedRefreshToken, userAgent, ip);
    const newAccessToken = this.signAccessToken(sharedFields, nowSeconds, isActiveUser);
    const newRefreshToken = this.signRefreshToken(sharedFields, nowSeconds);

    this.logIssuedTokens(decodedRefreshToken.sub, newAccessToken, newRefreshToken, isActiveUser);

    const result = { accessToken: newAccessToken, newRefreshToken };
    await this.cacheRefreshResult(redis, cacheKey, jti, result);
    return result;
  }

  private static buildSharedTokenFields(
    decoded: JWTPayload,
    userAgent: string,
    ip: string
  ): Omit<JWTPayload, "iat" | "exp" | "jti" | "type"> {
    return {
      sub: decoded.sub,
      nonce: decoded.nonce,
      userAgentHash: userAgent ? createHash("sha256").update(userAgent).digest("base64") : "",
      ipHash: ip ? createHash("sha256").update(ip).digest("base64") : "",
      authMethod: decoded.authMethod,
      totpEnabled: decoded.totpEnabled,
    };
  }

  private static signAccessToken(
    shared: Omit<JWTPayload, "iat" | "exp" | "jti" | "type">,
    nowSeconds: number,
    isActiveUser: boolean
  ): string {
    const exp = isActiveUser
      ? nowSeconds + this.ACCESS_TOKEN_EXPIRY_SECONDS + this.ACTIVE_USER_TOKEN_EXTENSION
      : nowSeconds + this.ACCESS_TOKEN_EXPIRY_SECONDS;
    return jwt.sign(
      { ...shared, iat: nowSeconds, exp, jti: randomBytes(16).toString("hex"), type: "access" } as JWTPayload,
      this.ACCESS_TOKEN_SECRET,
      { algorithm: "HS256" }
    );
  }

  private static signRefreshToken(
    shared: Omit<JWTPayload, "iat" | "exp" | "jti" | "type">,
    nowSeconds: number
  ): string {
    return jwt.sign(
      {
        ...shared,
        iat: nowSeconds,
        exp: nowSeconds + this.REFRESH_TOKEN_EXPIRY_SECONDS,
        jti: randomBytes(16).toString("hex"),
        type: "refresh",
      } as JWTPayload,
      this.REFRESH_TOKEN_SECRET,
      { algorithm: "HS256" }
    );
  }

  private static logIssuedTokens(
    sub: string,
    accessToken: string,
    refreshToken: string,
    isActiveUser: boolean
  ): void {
    logger.log(`[JWTManager] New tokens generated for ${sub}`);
    logger.log(`→ New accessToken JTI: ${(jwt.decode(accessToken) as JWTPayload | null)?.jti}`);
    const refreshJti = (jwt.decode(refreshToken) as JWTPayload | null)?.jti;
    const activeTag = isActiveUser
      ? ` (active-game: access TTL extended by ${this.ACTIVE_USER_TOKEN_EXTENSION}s)`
      : "";
    logger.log(`→ New refreshToken JTI: ${refreshJti}${activeTag}`);
  }

  private static async cacheRefreshResult(
    redis: RedisLike | null,
    cacheKey: string | null,
    jti: string | undefined,
    result: { accessToken: string; newRefreshToken: string }
  ): Promise<void> {
    if (!redis || !cacheKey) return;
    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 30);
    } catch (err) {
      logger.error(`[JWTManager] Error caching refresh result for JTI: ${jti}`, err);
    }
  }

  // ─── Private helpers (refresh flow) ────────────────────────────────────────

  private static async tryConnectRedis(): Promise<RedisLike | null> {
    try {
      const redisModule = await import("@/lib/redis");
      const redis = redisModule.default as unknown as RedisLike;
      const ping = await redis.ping();
      return ping === "PONG" ? redis : null;
    } catch {
      return null;
    }
  }

  private static async readCachedRefresh(
    redis: RedisLike,
    cacheKey: string,
    jti: string | undefined
  ): Promise<string | null> {
    try {
      return await redis.get(cacheKey);
    } catch (err) {
      logger.error(`[JWTManager] Error reading cached refresh result for JTI: ${jti}`, err);
      return null;
    }
  }

  private static async acquireRefreshLock(
    redis: RedisLike,
    lockKey: string,
    lockValue: string
  ): Promise<boolean> {
    const maxRetries = 30; // 3 seconds total max wait
    const retryDelay = 100; // 100ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // eslint-disable-next-line no-await-in-loop -- intentional bounded retry loop
      const setRes = await redis.set(lockKey, lockValue, "NX", "PX", 5000);
      if (setRes === "OK") return true;
      // eslint-disable-next-line no-await-in-loop -- intentional delay between attempts
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    return false;
  }

  private static async releaseLock(
    redis: RedisLike,
    lockKey: string,
    lockValue: string,
    jti: string | undefined
  ): Promise<void> {
    try {
      const currentVal = await redis.get(lockKey);
      if (currentVal === lockValue) {
        await redis.del(lockKey);
      }
    } catch (err) {
      logger.error(`[JWTManager] Error releasing lock for ${jti}:`, err);
    }
  }

  static extractTokenFromCookies(cookies: string, tokenName: string): string | null {
    const match = cookies.match(new RegExp(`${tokenName}=([^;]+)`));
    return match && match[1] ? match[1] : null;
  }
  // maxAge is expected in seconds for cookie
  /**
   * Creates secure cookie options with extended expiry for active users
   * @param maxAgeSeconds Base expiry time in seconds
   * @param requestHost Optional host for domain configuration
   * @param isActiveUser Whether to extend expiry for active users
   * @returns Cookie options object
   */
  static createSecureCookieOptions(
    maxAgeSeconds: number, 
    requestHost?: string,
    isActiveUser: boolean = false
  ) {
    let secureCookie = isProd;
    let sameSiteValue: "none" | "lax" | "strict" = isProd ? "none" : "lax";
    let cookieDomain: string | undefined = undefined;
    
    // Extend expiry for active users
    const finalMaxAge = isActiveUser 
      ? maxAgeSeconds + this.ACTIVE_USER_TOKEN_EXTENSION 
      : maxAgeSeconds;

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
      maxAge: finalMaxAge,
      path: "/",
    };

    if (cookieDomain) {
      options.domain = cookieDomain;
    }

    logger.log(
      `[JWTManager] Created cookie options: HttpOnly=${options.httpOnly}, Secure=${options.secure} (isProd: ${isProd}), SameSite=${options.sameSite}, MaxAge=${options.maxAge}s (Extended: ${isActiveUser}), Path=${options.path}, Domain=${options.domain || "N/A"} (RequestHost: ${requestHost || "N/A"})`
    );
    return options;
  }
}
