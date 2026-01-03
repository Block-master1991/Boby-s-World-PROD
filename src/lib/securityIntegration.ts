/**
 * Security Integration - Advanced security systems integration
 * Connects all security systems together in a unified interface
 */

import { keyVault } from './keyVaultService';
import { sessionManager } from './advancedSessionManager';
import { AdvancedRateLimiter } from './advancedRateLimiter';
import { DeviceInfo } from './advancedSessionManager';
import { logger } from 'utils/logger';

export interface SecurityContext {
    sessionId: string;
    userId: string;
    deviceFingerprint: string;
    riskScore: number;
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
    authMethod?: 'wallet' | 'biometric';
}

export interface AuthenticationResult {
    success: boolean;
    session?: SecurityContext;
    error?: string;
    requiresChallenge?: boolean;
    rateLimitInfo?: {
        allowed: boolean;
        retryAfter?: number;
        remaining?: number;
    };
}

export class SecurityIntegration {
    private static instance: SecurityIntegration;

    private constructor() { }

    public static getInstance(): SecurityIntegration {
        if (!SecurityIntegration.instance) {
            SecurityIntegration.instance = new SecurityIntegration();
        }
        return SecurityIntegration.instance;
    }

    /**
     * Comprehensive authentication with all security layers
     */
    public async authenticateRequest(
        request: Request,
        userId: string,
        endpoint: string,
        deviceInfo?: DeviceInfo
    ): Promise<AuthenticationResult> {
        try {
            // 1. Check Rate Limiting first
            const rateLimitResult = await AdvancedRateLimiter.getInstance().checkRateLimit(
                request,
                userId,
                endpoint,
                deviceInfo
            );

            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    error: 'Request limit exceeded',
                    rateLimitInfo: {
                        allowed: false,
                        retryAfter: rateLimitResult.retryAfter,
                        remaining: rateLimitResult.remaining
                    }
                };
            }

            // 2. Create secure session
            const session = await sessionManager.createSecureSession(
                userId,
                deviceInfo || this.extractDeviceInfo(request),
                {
                    timeoutMinutes: 30,
                    enableDeviceFingerprinting: true,
                    enableRiskScoring: true
                }
            );

            if (!session) {
                return {
                    success: false,
                    error: 'Failed to create secure session',
                    requiresChallenge: true
                };
            }

            // 3. Create security context
            const securityContext: SecurityContext = {
                sessionId: session.sessionId,
                userId: session.userId,
                deviceFingerprint: session.deviceFingerprint,
                riskScore: session.riskScore,
                securityLevel: this.calculateSecurityLevel(session.riskScore)
            };

            return {
                success: true,
                session: securityContext,
                rateLimitInfo: rateLimitResult
            };

        } catch (error) {
            logger.error('[SecurityIntegration] Authentication error:', error);
            return {
                success: false,
                error: 'Security system error'
            };
        }
    }

    /**
     * Validate session on every request
     */
    public async validateSession(
        sessionId: string,
        request: Request,
        deviceInfo?: DeviceInfo
    ): Promise<{ valid: boolean; session?: SecurityContext; error?: string }> {
        try {
            const device = deviceInfo || this.extractDeviceInfo(request);
            const validation = await sessionManager.validateSession(
                sessionId,
                device,
                request.headers.get('x-forwarded-for') || 'unknown',
                undefined // Geographic location can be added later
            );

            if (!validation.valid || !validation.session) {
                return {
                    valid: false,
                    error: validation.reason || 'Invalid session'
                };
            }

            const securityContext: SecurityContext = {
                sessionId: validation.session.sessionId,
                userId: validation.session.userId,
                deviceFingerprint: validation.session.deviceFingerprint,
                riskScore: validation.session.riskScore,
                securityLevel: this.calculateSecurityLevel(validation.session.riskScore),
                authMethod: validation.session.authMethod
            };

            return {
                valid: true,
                session: securityContext
            };

        } catch (error) {
            logger.error('[SecurityIntegration] Session validation error:', error);
            return {
                valid: false,
                error: 'Session validation error'
            };
        }
    }

    /**
     * Validate session seed and rotate it
     */
    public async validateAndRotateSeed(
        sessionId: string,
        providedSeed: string
    ): Promise<{ valid: boolean; nextSeed?: string; error?: string }> {
        return sessionManager.validateAndRotateSeed(sessionId, providedSeed);
    }

    /**
     * Encrypt data using secure keys
     */
    public async encryptData(data: string, keyId: string = 'default'): Promise<string> {
        try {
            let key = await keyVault.getSecureKey(keyId);
            if (!key) {
                logger.warn(`[SecurityIntegration] Key ${keyId} not found, creating automatically...`);
                await this.createSecureKey(keyId);
                key = await keyVault.getSecureKey(keyId);
                if (!key) throw new Error(`Failed to create and retrieve key: ${keyId}`);
            }

            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                dataBuffer
            );

            // Combine IV with encrypted data
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);

            return Buffer.from(combined).toString('base64');
        } catch (error) {
            logger.error('[SecurityIntegration] Encryption error:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * Decrypt data
     */
    public async decryptData(encryptedData: string, keyId: string = 'default'): Promise<string> {
        try {
            const key = await keyVault.getSecureKey(keyId);
            if (!key) {
                throw new Error(`Key not available: ${keyId}`);
            }

            const combined = Buffer.from(encryptedData, 'base64');
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            logger.error('[SecurityIntegration] Decryption error:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Terminate session securely
     */
    public async terminateSession(sessionId: string): Promise<boolean> {
        try {
            const success = await sessionManager.expireSession(sessionId);
            if (success) {
                logger.log(`[SecurityIntegration] Session terminated: ${sessionId}`);
            }
            return success;
        } catch (error) {
            logger.error('[SecurityIntegration] Session termination error:', error);
            return false;
        }
    }

    /**
     * Terminate all user sessions
     */
    public async terminateAllUserSessions(userId: string): Promise<number> {
        try {
            const count = await sessionManager.expireAllUserSessions(userId);
            logger.log(`[SecurityIntegration] Terminated ${count} sessions for user: ${userId}`);
            return count;
        } catch (error) {
            logger.error('[SecurityIntegration] User sessions termination error:', error);
            return 0;
        }
    }

    /**
     * Extract device information from request
     */
    public extractDeviceInfo(request: Request): DeviceInfo {
        // In real application, this information will be extracted from headers or body
        // Here we give default values for demonstration
        return {
            userAgent: request.headers.get('user-agent') || 'unknown',
            screenResolution: '1920x1080',
            hardwareConcurrency: 4,
            deviceMemory: 8,
            plugins: [],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: 'en-US',
            platform: 'unknown',
            colorDepth: 24,
            touchPoints: 0,
            canvas: 'default-canvas-fingerprint',
            webgl: 'default-webgl-fingerprint',
            fonts: [],
            audioContext: 'default-audio',
            battery: 'unknown',
            networkInfo: 'unknown'
        };
    }

    /**
     * Calculate security level
     */
    private calculateSecurityLevel(riskScore: number): SecurityContext['securityLevel'] {
        if (riskScore >= 90) return 'critical';
        if (riskScore >= 70) return 'high';
        if (riskScore >= 40) return 'medium';
        return 'low';
    }

    /**
     * Create new secure key
     */
    public async createSecureKey(keyId: string): Promise<boolean> {
        try {
            await keyVault.createSecureKey(keyId, { name: 'AES-GCM', length: 256 }, {
                autoRotate: true,
                rotationIntervalHours: 24,
                notifyBeforeExpiry: 1
            });
            logger.log(`[SecurityIntegration] Secure key created: ${keyId}`);
            return true;
        } catch (error) {
            logger.error('[SecurityIntegration] Key creation error:', error);
            return false;
        }
    }

    /**
     * Comprehensive security statistics
     */
    public async getSecurityStats(): Promise<{
        keyVault: { activeKeys: number; rotationTimers: number };
        sessions: {
            totalSessions: number;
            activeSessions: number;
            uniqueDevices: number;
            expiredSessions: number;
        };
        rateLimiting: {
            activeIdentifiers: number;
            reputationCacheSize: number;
            patternCacheSize: number;
        };
    }> {
        const sessionStats = await sessionManager.getSessionStats();
        return {
            keyVault: keyVault.getStats(),
            sessions: {
                ...sessionStats,
                uniqueDevices: sessionStats.totalSessions, // Approximation
                expiredSessions: 0 // Not tracked in Redis currently
            },
            rateLimiting: AdvancedRateLimiter.getInstance().getStats()
        };
    }

    /**
     * Comprehensive cleanup of all security systems
     */
    public cleanup(): void {
        keyVault.cleanup();
        AdvancedRateLimiter.getInstance().cleanup();
        logger.log('[SecurityIntegration] All security systems cleaned');
    }
}

// Export singleton instance
export const securityIntegration = SecurityIntegration.getInstance();
