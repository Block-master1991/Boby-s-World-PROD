
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { TokenBlacklistManager } from './token-blacklist'; 
import { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from './server-constants'; // Moved to server-side constants
import { createHash } from 'crypto';

export interface JWTPayload {
  sub: string; // Subject (user's public key)
  iat: number; // Issued at (timestamp in seconds)
  exp: number; // Expiration time (timestamp in seconds)
  jti: string; // JWT ID (unique identifier for the token)
  type: 'access' | 'refresh';
  nonce?: string; // Nonce used for this specific login session, tied to access token
  userAgentHash?: string;
  ipHash?: string; // Optional (can be undefined)
}

interface CreateTokenParams {
  publicKey: string;
  nonce?: string;
  userAgentHash?: string;
  ipHash?: string;
}

export class JWTManager {

  private static verifyFingerprint(
    decoded: JWTPayload,
    userAgent: string,
    ip: string
  ): boolean {
    const expectedUserAgentHash = decoded.userAgentHash || '';
    const expectedIpHash = decoded.ipHash || '';

    const actualUserAgentHash = expectedUserAgentHash
      ? createHash('sha256').update(userAgent).digest('base64')
      : '';
    const actualIpHash = expectedIpHash
      ? createHash('sha256').update(ip).digest('base64')
      : '';

    if (expectedUserAgentHash && actualUserAgentHash !== expectedUserAgentHash) {
      console.warn(`[JWTManager] User-Agent hash mismatch for token ${decoded.jti}`);
      return false;
    }

    if (expectedIpHash && actualIpHash !== expectedIpHash) {
      console.warn(`[JWTManager] IP hash mismatch for token ${decoded.jti}`);
      return false;
    }

    return true;
  }

  private static readonly ACCESS_TOKEN_SECRET = JWT_ACCESS_SECRET || 'access-secret-dev-for-boby-world-app-CHANGE-IN-PROD'; 
  private static readonly REFRESH_TOKEN_SECRET = JWT_REFRESH_SECRET || 'refresh-secret-dev-for-boby-world-app-CHANGE-IN-PROD';
  
  // Expiry times in seconds for consistency
  private static readonly ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
  private static readonly REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

  static createAccessToken(params: CreateTokenParams): string {
    const { publicKey, nonce, userAgentHash, ipHash } = params;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: JWTPayload = {
        sub: publicKey,
        iat: nowSeconds,
        exp: nowSeconds + this.ACCESS_TOKEN_EXPIRY_SECONDS, 
        jti: randomBytes(16).toString('hex'),
        type: 'access',
        nonce,
        userAgentHash,
        ipHash,
      };
      console.log(`[JWTManager] Creating access token for ${publicKey}. JTI: ${payload.jti}, Nonce: ${nonce}, UA Hash: ${userAgentHash}, IP Hash: ${ipHash}`);
      return jwt.sign(payload, this.ACCESS_TOKEN_SECRET, { algorithm: 'HS256' });
    }

  static createRefreshToken(params: CreateTokenParams): string {
    const { publicKey, nonce, userAgentHash, ipHash } = params;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const payload: JWTPayload = {
        sub: publicKey,
        iat: nowSeconds,
        exp: nowSeconds + this.REFRESH_TOKEN_EXPIRY_SECONDS, 
        jti: randomBytes(16).toString('hex'),
        type: 'refresh',
        nonce,
        userAgentHash,
        ipHash,
      };
      console.log(`[JWTManager] Creating refresh token for ${publicKey}. JTI: ${payload.jti}, Nonce: ${nonce}, UA Hash: ${userAgentHash}, IP Hash: ${ipHash}`);
      return jwt.sign(payload, this.REFRESH_TOKEN_SECRET, { algorithm: 'HS256' });
    }


static async verifyAccessToken(token: string, userAgent: string, ip: string): Promise<JWTPayload | null> { 
    let decodedForLog: JWTPayload | null = null;
    try {
      decodedForLog = jwt.decode(token) as JWTPayload | null; // Decode for logging before verification
      const jti = decodedForLog?.jti || 'unknown_jti';
      console.log(`[JWTManager] Attempting to verify access token. JTI (from decode): ${jti}, Type (from decode): ${decodedForLog?.type}`);

      const decoded = jwt.verify(token, this.ACCESS_TOKEN_SECRET) as JWTPayload;
      console.log(`[JWTManager] Access token JTI: ${decoded.jti} successfully passed signature verification. Type: ${decoded.type}, Sub: ${decoded.sub}, Exp: ${new Date(decoded.exp * 1000).toISOString()}`);
      
      if (await TokenBlacklistManager.isBlacklisted(decoded.jti)) {
        console.warn(`[JWTManager] Access token ${decoded.jti} is blacklisted.`);
        return null;
      }

      if (decoded.type !== 'access') {
         console.warn(`[JWTManager] Invalid token type for access token ${decoded.jti}. Expected 'access', got '${decoded.type}'.`);
        return null;
      }
      // jwt.verify already checks 'exp'
      if (decoded.exp * 1000 < Date.now()) {
        console.warn(`[JWTManager] Access token ${decoded.jti} has expired (checked explicitly post-verification, which is redundant but informative).`);
        await TokenBlacklistManager.addToBlacklist(decoded.jti, decoded.exp, 'expired');
        return null;
      }

      if (!this.verifyFingerprint(decoded, userAgent, ip)) return null;

      return decoded;
    } catch (error: any) {
      const jti = decodedForLog?.jti || 'unknown_jti_on_error';
      console.error(`[JWTManager] Access token verification failed. JTI: ${jti}`, error.message);
      if (error.name === 'TokenExpiredError' && decodedForLog?.jti && decodedForLog?.exp) 
        {
        await TokenBlacklistManager.addToBlacklist(decodedForLog.jti, decodedForLog.exp, 'expired');
      }
      return null;
    }
  }

  static async verifyRefreshToken(token: string, userAgent: string, ip: string): Promise<JWTPayload | null> {
    let decodedForLog: JWTPayload | null = null;
    try {
      decodedForLog = jwt.decode(token) as JWTPayload | null;
      const jti = decodedForLog?.jti || 'unknown_jti';
      console.log(`[JWTManager] Attempting to verify refresh token. JTI (from decode): ${jti}, Type (from decode): ${decodedForLog?.type}`);

      const decoded = jwt.verify(token, this.REFRESH_TOKEN_SECRET) as JWTPayload;
      console.log(`[JWTManager] Refresh token JTI: ${decoded.jti} successfully passed signature verification. Type: ${decoded.type}, Sub: ${decoded.sub}, Exp: ${new Date(decoded.exp * 1000).toISOString()}`);
      
      if (await TokenBlacklistManager.isBlacklisted(decoded.jti)) {
        console.warn(`[JWTManager] Refresh token ${decoded.jti} is blacklisted.`);
        return null;
      }

      if (decoded.type !== 'refresh') {
        console.warn(`[JWTManager] Invalid token type for refresh token ${decoded.jti}. Expected 'refresh', got '${decoded.type}'.`);
        return null;
      }
       if (decoded.exp * 1000 < Date.now()) {
        console.warn(`[JWTManager] Refresh token ${decoded.jti} has expired (checked explicitly post-verification). Blacklisting.`);
        await TokenBlacklistManager.addToBlacklist(decoded.jti, decoded.exp, 'expired'); 
        return null; 
      }
      
      if (!this.verifyFingerprint(decoded, userAgent, ip)) return null;

      console.log(`[JWTManager] Refresh token ${decoded.jti} verified successfully (not blacklisted, correct type, not expired).`);
      return decoded;
    } catch (error: any) {
      const jti = decodedForLog?.jti || 'unknown_jti_on_error';
      console.error(`[JWTManager] Refresh token verification failed. JTI: ${jti}`, error.message);
      if (error.name === 'TokenExpiredError' && decodedForLog?.jti && decodedForLog?.exp) 
        {
        await TokenBlacklistManager.addToBlacklist(decodedForLog.jti, decodedForLog.exp, 'expired');
      }
      return null;
    }
  }

  static async revokeToken(token: string, reason: 'logout' | 'security_breach' | 'expired' = 'logout'): Promise<boolean> {
    let decodedForLog: JWTPayload | null = null;
    try {
      decodedForLog = jwt.decode(token) as JWTPayload | null;
      if (!decodedForLog || !decodedForLog.jti || !decodedForLog.exp) {
        console.warn('[JWTManager] Failed to decode token for revocation or missing jti/exp. Token (first 20 chars):', token.substring(0,20), 'Attempting verification to get details...');
        let verifiedDecoded : JWTPayload | null = null;
        try {
             const secretToUse = decodedForLog?.type === 'access' ? this.ACCESS_TOKEN_SECRET : this.REFRESH_TOKEN_SECRET;
             if(decodedForLog?.type) { // Only try to verify if we have a hint of the type
                verifiedDecoded = jwt.verify(token, secretToUse ) as JWTPayload;
             }
        } catch (e) { 
            console.warn('[JWTManager] Verification attempt during revocation also failed:', (e as Error).message);
        }

        if (verifiedDecoded && verifiedDecoded.jti && verifiedDecoded.exp) {
             console.log(`[JWTManager] Token for revocation was verifiable (JTI: ${verifiedDecoded.jti}, Type: ${verifiedDecoded.type}). Adding to blacklist.`);
             await TokenBlacklistManager.addToBlacklist(verifiedDecoded.jti, verifiedDecoded.exp, reason);
             return true;
        } else {
             console.warn('[JWTManager] Token for revocation still missing JTI/exp even after verification attempt. Cannot blacklist.');
             return false;
        }
      }
      console.log(`[JWTManager] Revoking token JTI: ${decodedForLog.jti}, Type: ${decodedForLog.type}, Reason: ${reason}, Original Exp: ${new Date(decodedForLog.exp * 1000).toISOString()}`);
      await TokenBlacklistManager.addToBlacklist(decodedForLog.jti, decodedForLog.exp, reason); 
      return true;
    } catch (error: any) { 
      console.error('[JWTManager] Unexpected error during token revocation logic:', error.message, error.stack);
      return false;
    }
  }

  static async refreshAccessToken(refreshTokenValue: string, userAgent: string, ip: string): Promise<{ accessToken: string; newRefreshToken: string } | null> {
    console.log(`[JWTManager] Attempting to refresh access token using refresh token (first 20 chars): ${refreshTokenValue.substring(0,20)}...`);
    const decodedRefreshToken = await this.verifyRefreshToken(refreshTokenValue, userAgent, ip);
    if (!decodedRefreshToken) {
      console.warn('[JWTManager] Refresh token verification failed during access token refresh. Cannot proceed.');
      // verifyRefreshToken should have already blacklisted it if it was expired or invalid and verifiable
      return null;
    }

    // Important: Revoke the old refresh token *after* successfully verifying it and *before* issuing new ones.
    // This prevents replay of the same refresh token if something goes wrong after this point.
    console.log(`[JWTManager] Old refresh token ${decodedRefreshToken.jti} verified. Revoking it as it's being used for refresh.`);
    await this.revokeToken(refreshTokenValue, 'expired'); // Mark as 'expired' because it's consumed
    
    const userAgentHash = userAgent ? createHash('sha256').update(userAgent).digest('base64') : '';
    const ipHash = ip ? createHash('sha256').update(ip).digest('base64') : '';

    const newAccessToken = this.createAccessToken({
      publicKey: decodedRefreshToken.sub,
      nonce: decodedRefreshToken.nonce,
      userAgentHash,
      ipHash,
    } );

    const newRefreshToken = this.createRefreshToken({
      publicKey: decodedRefreshToken.sub,
      nonce: decodedRefreshToken.nonce,
      userAgentHash,
      ipHash,
    } );


    const newAccessDecoded = jwt.decode(newAccessToken) as JWTPayload | null;
    const newRefreshDecoded = jwt.decode(newRefreshToken) as JWTPayload | null;


    console.log(`[JWTManager] New tokens generated for ${decodedRefreshToken.sub}`);
    console.log(`→ New accessToken JTI: ${newAccessDecoded?.jti}`);
    console.log(`→ New refreshToken JTI: ${newRefreshDecoded?.jti}`);

    return {
      accessToken: newAccessToken,
      newRefreshToken: newRefreshToken
    };
  }

  static extractTokenFromCookies(cookies: string, tokenName: string): string | null {
    const match = cookies.match(new RegExp(`${tokenName}=([^;]+)`));
    const token = match ? match[1] : null;
    // console.log(`[JWTManager] Extracted token '${tokenName}' from cookies. Found: ${token ? 'Yes (masked)' : 'No'}`); // Mask token value
    return token;
  }

  // maxAge is expected in seconds for cookie
  static createSecureCookieOptions(maxAgeSeconds: number, requestHost?: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    let secureCookie = isProduction;
    let sameSiteValue: 'none' | 'lax' | 'strict' = isProduction ? 'none' : 'lax';
    let cookieDomain: string | undefined = undefined;

    if (requestHost) {
      // Extract base domain from host (e.g., "divine-bedbug-valued.ngrok-free.app:443" -> "divine-bedbug-valued.ngrok-free.app")
      const hostWithoutPort = requestHost.split(':')[0];
      // For ngrok or other cross-origin development, we need SameSite=None and Secure=true
      // if the request is coming from an HTTPS origin.
      // We assume if requestHost is provided, it's the public-facing domain.
      if (!isProduction && hostWithoutPort.includes('ngrok')) { // Specific check for ngrok in dev
        secureCookie = true;
        sameSiteValue = 'none';
        cookieDomain = hostWithoutPort; // Set domain for cross-origin cookies
      } else if (isProduction) {
        cookieDomain = hostWithoutPort; // In production, set domain to host
      }
    }

    const options: any = {
      httpOnly: true,
      secure: secureCookie,
      sameSite: sameSiteValue,
      maxAge: maxAgeSeconds,
      path: '/', 
    };

    if (cookieDomain) {
      options.domain = cookieDomain;
    }

    console.log(`[JWTManager] Created cookie options: HttpOnly=${options.httpOnly}, Secure=${options.secure} (isProduction: ${isProduction}), SameSite=${options.sameSite}, MaxAge=${options.maxAge}s, Path=${options.path}, Domain=${options.domain || 'N/A'} (NODE_ENV: ${process.env.NODE_ENV}, RequestHost: ${requestHost || 'N/A'})`);
    return options;
  }
}
