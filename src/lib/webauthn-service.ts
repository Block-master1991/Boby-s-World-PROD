/**
 * WebAuthn Service
 * Centralizes all WebAuthn logic for registration, authentication, and management.
 */

import { randomBytes } from 'crypto';
import type { AuditEventMetadata } from './audit-logger';
import { auditLogger } from './audit-logger';
import { db } from './firebase-admin';
import redis from './redis';
import { WebAuthnUtils } from './webauthn-utils';

export class WebAuthnService {
    /**
     * Resolves the Redis key for the WebAuthn challenge consistently
     */
    public static getChallengeKey(type: 'registration' | 'auth' | 'discovery', identifier: string): string {
        switch (type) {
            case 'registration': return `webauthn_registration_challenge:${identifier}`;
            case 'auth': return `webauthn_auth_challenge:${identifier}`;
            case 'discovery': return `webauthn_discovery_challenge:${identifier}`;
            default: return 'webauthn_latest_discovery_challenge';
        }
    }

    /**
     * Initiates the registration process for a user
     */
    public static async initiateRegistration(userId: string, userName: string, rpId: string, metadata: AuditEventMetadata) {
        const options = WebAuthnUtils.generateRegistrationChallenge(userId, userName, rpId);
        const key = this.getChallengeKey('registration', userId);
        
        await redis.setex(key, 120, options.challenge);
        
        await auditLogger.logEvent(
            'PASSKEY_REGISTRATION_INITIATED',
            `Passkey registration initiated for user ${userId}`,
            { ...metadata, userId },
            'info'
        );

        return options;
    }

    /**
     * Initiates the authentication (Login) process
     */
    public static async initiateAuthentication(rpId: string, userId?: string) {
        const options = WebAuthnUtils.generateAuthenticationChallenge(rpId);

        if (!userId) {
            // Discovery Mode (Passkey autofill / Conditional UI)
            const discoveryId = randomBytes(16).toString('hex');
            const key = this.getChallengeKey('discovery', discoveryId);
            await redis.setex(key, 120, options.challenge);

            return {
                ...options,
                discoveryId,
                allowCredentials: [] // Allows discoverable credentials
            };
        }

        // Specific User Login
        const credentialsSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();
        const allowCredentials = credentialsSnapshot.docs.map(doc => ({
            id: doc.id,
            type: 'public-key' as const
        }));

        const key = this.getChallengeKey('auth', userId);
        await redis.setex(key, 120, options.challenge);

        return {
            ...options,
            userId,
            allowCredentials
        };
    }

    /**
     * Completes and saves the passkey registration
     */
    public static async completeRegistration(userId: string, credential: { id: string, publicKey: string, authData?: string | undefined }, description?: string, transports: string[] = []) {
        const aaguid = credential.authData ? WebAuthnUtils.extractAAGUID(credential.authData) : undefined;
        const deviceBrand = WebAuthnUtils.getAuthenticatorName(aaguid);
        const finalDescription = description || deviceBrand;

        await db.collection('players').doc(userId).collection('passkeys').doc(credential.id).set({
            credentialId: credential.id,
            publicKey: credential.publicKey,
            aaguid: aaguid || null,
            deviceBrand: deviceBrand,
            counter: 0,
            transports: transports,
            description: finalDescription,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString()
        });

        // Cleanup challenge
        const key = this.getChallengeKey('registration', userId);
        await redis.del(key);

        return { success: true, message: 'Passkey registered successfully' };
    }

    /**
     * Lists and sanitizes passkeys for a user
     */
    public static async listUserPasskeys(userId: string) {
        const passkeysSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();
        
        return passkeysSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                description: data['description'] || 'Unnamed Device',
                deviceBrand: data['deviceBrand'] || 'Biometric Device',
                createdAt: data['createdAt'],
                lastUsedAt: data['lastUsedAt'],
                transports: data['transports'] || []
            };
        });
    }

    /**
     * Removes a passkey for a user, enforcing security rules
     */
    public static async removePasskey(userId: string, credentialId: string, metadata: AuditEventMetadata) {
        const passkeysSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();
        
        if (passkeysSnapshot.size <= 1) {
            throw new Error('Cannot delete the last passkey. Please set up account recovery or another passkey first.');
        }

        const passkeyRef = db.collection('players').doc(userId).collection('passkeys').doc(credentialId);
        const passkeyDoc = await passkeyRef.get();

        if (!passkeyDoc.exists) {
            throw new Error('Passkey not found or does not belong to user');
        }

        await passkeyRef.delete();

        await auditLogger.logEvent(
            'PASSKEY_DELETED',
            `Passkey ${credentialId} deleted by user ${userId}`,
            { ...metadata, userId, credentialId },
            'warn'
        );

        return { success: true, message: 'Passkey deleted successfully' };
    }
}
