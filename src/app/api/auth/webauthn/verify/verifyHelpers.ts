/**
 * WebAuthn Verify Route Helpers
 */

import { db } from '@/lib/firebase-admin';
import { JWTManager } from '@/lib/jwt-utils';
import type { WebAuthnCredential } from '@/lib/webauthn-utils';
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { NextResponse } from 'next/server';

/**
 * Resolves the Redis key for the WebAuthn challenge
 */
export function getWebAuthnChallengeKey(userId?: string, discoveryId?: string): string {
    if (userId) return `webauthn_auth_challenge:${userId}`;
    if (discoveryId) return `webauthn_discovery_challenge:${discoveryId}`;
    return 'webauthn_latest_discovery_challenge';
}

/**
 * Resolves user (publicKey) from passkey credential ID in discovery mode
 */
export async function resolveUserFromDiscovery(credentialId: string): Promise<string | undefined> {
    const passkeyQuery = await db.collectionGroup('passkeys')
        .where('credentialId', '==', credentialId)
        .limit(1)
        .get();

    if (passkeyQuery.empty) return undefined;

    const [passkeyDoc] = passkeyQuery.docs;
    const userId = passkeyDoc?.ref.parent.parent?.id;
    return userId;
}

/**
 * Maps Firestore document data to WebAuthnCredential
 */
export function mapToWebAuthnCredential(docId: string, data: Record<string, unknown>, userId: string): WebAuthnCredential {
    return {
        id: docId,
        publicKey: data['publicKey'] as string,
        counter: (data['counter'] as number) || 0,
        transports: data['transports'] as string[],
        userId
    };
}

/**
 * Converts browser AuthenticatorAssertionResponse to WebAuthnUtils format
 */
function convertAssertionResponse(response: unknown): { authenticatorData: string; clientDataJSON: string; signature: string; userHandle?: string } {
    const r = response as { authenticatorData: ArrayBuffer; clientDataJSON: ArrayBuffer; signature: ArrayBuffer; userHandle: ArrayBuffer | null };

    const result: { authenticatorData: string; clientDataJSON: string; signature: string; userHandle?: string } = {
        authenticatorData: Buffer.from(r.authenticatorData).toString('base64url'),
        clientDataJSON: Buffer.from(r.clientDataJSON).toString('base64url'),
        signature: Buffer.from(r.signature).toString('base64url')
    };

    if (r.userHandle) {
        result.userHandle = Buffer.from(r.userHandle).toString('base64url');
    }

    return result;
}

interface VerifySignatureParams {
    credentialData: Record<string, unknown>;
    credentialId: string;
    response: unknown;
    storedChallenge: string;
    origin: string;
    userId: string;
}

/**
 * Verifies the biometric signature
 */
export function verifyPasskeySignature({
    credentialData,
    credentialId,
    response,
    storedChallenge,
    origin,
    userId
}: VerifySignatureParams): Promise<boolean> {
    const credential = mapToWebAuthnCredential(credentialId, credentialData, userId);
    const convertedResponse = convertAssertionResponse(response);
    return WebAuthnUtils.verifyAuthenticationResponse(
        credential,
        convertedResponse,
        storedChallenge,
        origin
    );
}

interface IssueTokensParams {
    publicKey: string;
    requestHost: string;
    response: NextResponse;
}

/**
 * Issues JWT tokens and sets secure cookies on the response
 */
export function issueTokensAndCookies({ publicKey, requestHost, response }: IssueTokensParams): void {
    const accessToken = JWTManager.createAccessToken({ publicKey });
    const refreshToken = JWTManager.createRefreshToken({ publicKey });

    response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
    response.cookies.set('refreshToken', refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));
}

interface BindingParams {
    sessionId: string;
    currentSeed: string;
    requestHost: string;
    response: NextResponse;
}

/**
 * Binds secure session data to cookies
 */
export function bindSessionToCookies({ sessionId, currentSeed, requestHost, response }: BindingParams): void {
    const cookieOptions = JWTManager.createSecureCookieOptions(30 * 60, requestHost);
    
    response.cookies.set('secure_session', sessionId, {
        ...(cookieOptions as ResponseCookie),
        httpOnly: true
    });
    
    response.cookies.set('session_seed', currentSeed, {
        ...(cookieOptions as ResponseCookie),
        httpOnly: true
    });
}
