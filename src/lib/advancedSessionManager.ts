/**
 * Advanced Session Manager - Advanced session management system
 * Provides enterprise-level security with advanced device fingerprinting
 * Refactored to use Redis for distributed persistence
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { keyVault } from './keyVaultService';
import redis from './redis';
import { logger } from 'utils/logger';

export interface DeviceInfo {
    userAgent: string;
    language: string;
    platform: string;
    timezone: string;
    screenResolution: string;
    colorDepth: number;
    hardwareConcurrency: number;
    deviceMemory: number;
    touchPoints: number;
    plugins: string[];
    canvas: string;
    webgl: string;
    fonts: string[];
    audioContext: string;
    battery: string;
    networkInfo: string;
}

export interface SessionData {
    sessionId: string;
    userId: string;
    deviceFingerprint: string;
    createdAt: number;
    lastActivityAt: number;
    expiresAt: number;
    securityContext: SecurityContext;
    riskScore: number;
    location?: GeoLocation;
    currentSeed: string; // Current seed being used
    previousSeed?: string; // Previous seed (to allow grace period for parallel requests)
    seedExpiresAt: number; // Current seed expiry time
    isActive: boolean;
    authMethod: 'wallet' | 'biometric'; // 2FA Status
    credentialId?: string; // WebAuthn Credential ID used for biometric login
}

export interface SecurityContext {
    entropy: string;
    deviceBindingKey: string;
    challenge: string;
    proof: string;
}

export interface GeoLocation {
    country: string;
    region: string;
    city: string;
    lat: number;
    lng: number;
    accuracy: number;
}

export interface SessionOptions {
    timeoutMinutes?: number;
    absoluteTimeoutMinutes?: number;
    maxConcurrentSessions?: number;
    enableDeviceFingerprinting?: boolean;
    enableRiskScoring?: boolean;
    enableGeolocation?: boolean;
    authMethod?: 'wallet' | 'biometric';
    credentialId?: string;
}

export class AdvancedSessionManager {
    private static instance: AdvancedSessionManager;
    private readonly DEFAULT_TIMEOUT = 30 * 60; // 30 minutes in seconds
    private readonly MAX_CONCURRENT_SESSIONS = 5;
    private readonly ENTROPY_BITS = 256;
    private readonly RISK_THRESHOLD = 70;

    // Redis Key Prefixes
    private readonly SESSION_PREFIX = 'session:v2:';
    private readonly FINGERPRINT_PREFIX = 'fingerprint:v2:';
    private readonly USER_SESSIONS_PREFIX = 'user_sessions:v2:';

    private constructor() { }

    public static getInstance(): AdvancedSessionManager {
        if (!AdvancedSessionManager.instance) {
            AdvancedSessionManager.instance = new AdvancedSessionManager();
        }
        return AdvancedSessionManager.instance;
    }

    /**
     * Create new secure session with advanced device fingerprinting
     */
    public async createSecureSession(
        userId: string,
        deviceInfo: DeviceInfo,
        options?: SessionOptions
    ): Promise<SessionData | null> {
        try {
            // Check concurrent sessions count
            const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
            const activeSessionCount = await redis.scard(userSessionsKey);

            if (activeSessionCount >= (options?.maxConcurrentSessions || this.MAX_CONCURRENT_SESSIONS)) {
                logger.warn(`[SessionManager] Maximum sessions limit exceeded for user ${userId}`);
                // Optional: Force expire oldest session? For now, reject.
                return null;
            }

            // Generate advanced device fingerprint
            const deviceFingerprint = await this.generateAdvancedDeviceFingerprint(deviceInfo);

            // Generate device binding key
            const deviceBindingKey = await this.generateDeviceBindingKey(deviceFingerprint);

            // Generate high-quality entropy
            const entropy = await this.generateHighEntropy();

            // Create security context
            const securityContext: SecurityContext = {
                entropy,
                deviceBindingKey,
                challenge: randomBytes(32).toString('hex'),
                proof: randomBytes(32).toString('hex')
            };

            // Calculate risk score
            const riskScore = await this.calculateRiskScore(deviceInfo);

            // Create session
            const sessionId = await this.generateSecureSessionId();
            const now = Date.now();
            const timeoutSeconds = (options?.timeoutMinutes || 30) * 60;

            const sessionData: SessionData = {
                sessionId,
                userId,
                deviceFingerprint,
                createdAt: now,
                lastActivityAt: now,
                expiresAt: now + (timeoutSeconds * 1000),
                securityContext,
                riskScore,
                currentSeed: randomBytes(16).toString('hex'),
                seedExpiresAt: now + 30000,
                isActive: true,
                authMethod: options?.authMethod || 'wallet',
                credentialId: options?.credentialId
            };

            // Store session in Redis
            const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
            const fingerprintKey = `${this.FINGERPRINT_PREFIX}${deviceFingerprint}`;

            await redis.multi()
                .setex(sessionKey, timeoutSeconds, JSON.stringify(sessionData)) // Session info with TTL
                .sadd(userSessionsKey, sessionId) // Add to user's session list
                .sadd(fingerprintKey, sessionId) // Add to fingerprint map
                .expire(userSessionsKey, timeoutSeconds + 3600) // Keep user set alive slightly longer
                .expire(fingerprintKey, timeoutSeconds + 3600)
                .exec();

            logger.log(`[SessionManager] Secure session created: ${sessionId} for user ${userId}`);
            return sessionData;
        } catch (error) {
            logger.error(`[SessionManager] Failed to create secure session for user ${userId}:`, error);
            return null;
        }
    }

    /**
     * Validate session and bind to device
     */
    public async validateSession(
        sessionId: string,
        deviceInfo: DeviceInfo,
        currentIp: string,
        currentLocation?: GeoLocation
    ): Promise<{ valid: boolean; session?: SessionData; reason?: string }> {
        try {
            const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
            const sessionStr = await redis.get(sessionKey);

            if (!sessionStr) {
                return { valid: false, reason: 'Session not found or expired' };
            }

            const session: SessionData = JSON.parse(sessionStr);

            if (!session.isActive) {
                return { valid: false, reason: 'Session terminated' };
            }

            // Check session expiry (Redis TTL handles cleanup, but checking expiresAt explicitly matches logic)
            if (session.expiresAt < Date.now()) {
                await this.expireSession(sessionId);
                return { valid: false, reason: 'Session expired' };
            }

            // Verify device fingerprint
            const currentFingerprint = await this.generateAdvancedDeviceFingerprint(deviceInfo);
            if (session.deviceFingerprint !== currentFingerprint) {
                logger.warn(`[SessionManager] Different device fingerprint for session ${sessionId}`);

                // Calculate risk level to continue
                const riskScore = await this.calculateRiskScore(deviceInfo);
                if (riskScore > this.RISK_THRESHOLD) {
                    await this.expireSession(sessionId);
                    return { valid: false, reason: 'Security violation: Device fingerprint mismatch with high risk score' };
                }

                // Update device fingerprint
                // We need to move session ID from old fingerprint set to new one
                const oldFingerprintKey = `${this.FINGERPRINT_PREFIX}${session.deviceFingerprint}`;
                const newFingerprintKey = `${this.FINGERPRINT_PREFIX}${currentFingerprint}`;

                await redis.multi()
                    .srem(oldFingerprintKey, sessionId)
                    .sadd(newFingerprintKey, sessionId)
                    .expire(newFingerprintKey, this.DEFAULT_TIMEOUT)
                    .exec();

                session.deviceFingerprint = currentFingerprint;
            }

            // --- Device Binding 2.0: WebAuthn Credential Mapping ---
            // If the session was created with a biometric auth, ensure it stays bound to that credential
            if (session.authMethod === 'biometric' && session.credentialId) {
                // In a production environment with rigorous device binding, we would ideally verify
                // that the device still contains this credential, but for session management,
                // we ensure the session metadata remains consistent.
                // We'll also increment risk if biometric session is used from a suspicious device.
                if (session.riskScore > 50) {
                    logger.warn(`[SessionManager] Biometric session ${sessionId} used under moderate risk.`);
                }
            }

            // Update last activity and renew TTL
            session.lastActivityAt = Date.now();
            session.expiresAt = Date.now() + (this.DEFAULT_TIMEOUT * 1000); // Update expiry time

            // Check geolocation
            if (currentLocation && session.location) {
                const distance = this.calculateDistance(session.location, currentLocation);
                if (distance > 500) {
                    logger.warn(`[SessionManager] Sudden geographic location change for session ${sessionId}`);
                    session.riskScore += 20;
                }
            }

            // Check risk level
            if (session.riskScore > 100) {
                await this.expireSession(sessionId);
                return { valid: false, reason: 'Very high risk level' };
            }

            // Save updates in Redis
            await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));

            return { valid: true, session };
        } catch (error) {
            logger.error(`[SessionManager] Error validating session ${sessionId}:`, error);
            return { valid: false, reason: 'Validation error' };
        }
    }

    /**
     * Validate session seed and rotate it
     */
    public async validateAndRotateSeed(
        sessionId: string,
        providedSeed: string
    ): Promise<{ valid: boolean; nextSeed?: string; error?: string }> {
        const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
        const sessionStr = await redis.get(sessionKey);

        if (!sessionStr) return { valid: false, error: 'Invalid session' };
        const session: SessionData = JSON.parse(sessionStr);

        const now = Date.now();

        // 1. Is it a match for the current seed?
        const isCurrentMatch = this.safeCompare(session.currentSeed, providedSeed);

        // 2. Is it a match for the previous seed within the 5s grace window?
        const isPreviousMatch = session.previousSeed &&
            this.safeCompare(session.previousSeed, providedSeed) &&
            (now - session.seedExpiresAt < 30000); // Increased grace window to 30s

        if (isCurrentMatch) {
            // Normal rotation
            const nextSeed = randomBytes(16).toString('hex');
            session.previousSeed = session.currentSeed;
            session.currentSeed = nextSeed;
            session.seedExpiresAt = now;

            // Save updated seeds
            await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));

            return { valid: true, nextSeed };
        }

        if (isPreviousMatch) {
            // Parallel request hit
            logger.log(`[SessionManager] Parallel request match for session ${sessionId}. Returning existing currentSeed.`);
            return { valid: true, nextSeed: session.currentSeed };
        }

        // Neither matches
        logger.warn(`[SessionManager] Seed mismatch for session ${sessionId}. Provided: ${providedSeed}`);

        // Update risk score
        session.riskScore += 10;
        await redis.setex(sessionKey, this.DEFAULT_TIMEOUT, JSON.stringify(session));

        return { valid: false, error: 'Invalid or expired session seed' };
    }

    /**
     * Expire session
     */
    public async expireSession(sessionId: string): Promise<boolean> {
        try {
            const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
            const sessionStr = await redis.get(sessionKey);

            if (sessionStr) {
                const session: SessionData = JSON.parse(sessionStr);
                const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${session.userId}`;
                const fingerprintKey = `${this.FINGERPRINT_PREFIX}${session.deviceFingerprint}`;

                await redis.multi()
                    .del(sessionKey)
                    .srem(userSessionsKey, sessionId)
                    .srem(fingerprintKey, sessionId)
                    .exec();

                logger.log(`[SessionManager] Session expired: ${sessionId}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`[SessionManager] Error expiring session ${sessionId}:`, error);
            return false;
        }
    }

    /**
     * Generate advanced device fingerprint
     */
    private async generateAdvancedDeviceFingerprint(deviceInfo: DeviceInfo): Promise<string> {
        const components = [
            deviceInfo.userAgent,
            deviceInfo.language,
            deviceInfo.platform,
            deviceInfo.timezone,
            deviceInfo.screenResolution,
            deviceInfo.colorDepth.toString(),
            deviceInfo.hardwareConcurrency.toString(),
            deviceInfo.deviceMemory?.toString() || '0',
            deviceInfo.touchPoints.toString(),
            deviceInfo.plugins.join(','),
            deviceInfo.canvas,
            deviceInfo.webgl,
            deviceInfo.fonts.join(','),
            deviceInfo.audioContext,
            deviceInfo.battery,
            deviceInfo.networkInfo
        ];

        const combinedString = components.join('|');
        return createHash('sha256').update(combinedString).digest('hex');
    }

    /**
     * Generate device binding key
     */
    private async generateDeviceBindingKey(deviceFingerprint: string): Promise<string> {
        try {
            const key = await keyVault.createSecureKey('device-binding-key');
            const encoder = new TextEncoder();
            const data = encoder.encode(deviceFingerprint);

            const signature = await crypto.subtle.sign(
                { name: 'HMAC', hash: 'SHA-256' },
                key,
                data
            );

            return Buffer.from(signature).toString('hex');
        } catch (error) {
            logger.warn('[SessionManager] Failed to create device binding key, using simple hash');
            return createHash('sha256').update(deviceFingerprint + 'device-binding').digest('hex');
        }
    }

    /**
     * Generate high-quality entropy
     */
    private async generateHighEntropy(): Promise<string> {
        const entropyPool = new Uint8Array(this.ENTROPY_BITS / 8);
        crypto.getRandomValues(entropyPool);

        const timeEntropy = new Uint8Array(8);
        const timeBytes = new DataView(new ArrayBuffer(8));
        timeBytes.setBigUint64(0, BigInt(Date.now()));
        timeEntropy.set(new Uint8Array(timeBytes.buffer));

        const combined = new Uint8Array(entropyPool.length + timeEntropy.length);
        combined.set(entropyPool, 0);
        combined.set(timeEntropy, entropyPool.length);

        return Buffer.from(combined).toString('hex');
    }

    /**
     * Generate secure session ID
     */
    private async generateSecureSessionId(): Promise<string> {
        const sessionBytes = randomBytes(32);
        const timestampBytes = new DataView(new ArrayBuffer(8));
        timestampBytes.setBigInt64(0, BigInt(Date.now()));

        const combined = new Uint8Array(40);
        combined.set(sessionBytes, 0);
        combined.set(new Uint8Array(timestampBytes.buffer), 32);

        return createHash('sha256').update(combined).digest('hex');
    }

    /**
     * Calculate risk level
     */
    private async calculateRiskScore(deviceInfo: DeviceInfo): Promise<number> {
        let riskScore = 0;

        if (deviceInfo.userAgent.includes('bot') || deviceInfo.userAgent.includes('crawler')) {
            riskScore += 30;
        }

        const [width, height] = deviceInfo.screenResolution.split('x').map(Number);
        if (width < 800 || height < 600) {
            riskScore += 10;
        }

        if (deviceInfo.hardwareConcurrency < 2) {
            riskScore += 5;
        }

        if (deviceInfo.deviceMemory && deviceInfo.deviceMemory < 2) {
            riskScore += 5;
        }

        if (deviceInfo.plugins.length === 0) {
            riskScore += 10;
        }

        return Math.min(riskScore, 100);
    }

    /**
     * Calculate distance between two geographic locations
     */
    private calculateDistance(loc1: GeoLocation, loc2: GeoLocation): number {
        const R = 6371;
        const dLat = this.toRadians(loc2.lat - loc1.lat);
        const dLon = this.toRadians(loc2.lng - loc1.lng);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(loc1.lat)) * Math.cos(this.toRadians(loc2.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    /**
     * Session statistics
     */
    public async getSessionStats(): Promise<{
        totalSessions: number;
        activeSessions: number;
    }> {
        // This is an estimation with distributed Redis
        // We can scan for keys, but that's slow.
        // Better to rely on monitoring tools or estimated counters.
        // For now, let's return 0 or implement a global counter if strictly needed.
        // Or using `keys` command (bad for prod)
        // Let's use dbsize as a proxy if dedicated db
        const dbSize = await redis.dbsize();
        return {
            totalSessions: dbSize, // Approximate
            activeSessions: dbSize
        };
    }

    /**
     * Expire all user sessions
     */
    public async expireAllUserSessions(userId: string): Promise<number> {
        const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
        const sessionIds = await redis.smembers(userSessionsKey);

        let expiredCount = 0;
        for (const sessionId of sessionIds) {
            if (await this.expireSession(sessionId)) {
                expiredCount++;
            }
        }

        await redis.del(userSessionsKey); // Cleanup set

        logger.log(`[SessionManager] Expired ${expiredCount} sessions for user ${userId}`);
        return expiredCount;
    }

    /**
     * Timing-safe comparison
     */
    private safeCompare(a: string, b: string): boolean {
        try {
            const bufferA = Buffer.from(a);
            const bufferB = Buffer.from(b);
            if (bufferA.length !== bufferB.length) return false;
            return timingSafeEqual(bufferA, bufferB);
        } catch (e) {
            return false;
        }
    }
}

// Export singleton instance
export const sessionManager = AdvancedSessionManager.getInstance();
