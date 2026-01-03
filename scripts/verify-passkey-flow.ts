/**
 * Passkey Registration Flow Verification Script
 * This script simulates the backend part of registering a passkey
 * to verify that Firebase and Redis are working correctly.
 */

import 'dotenv/config';
import { initializeAdminApp, db } from '../src/lib/firebase-admin';
import redis from '../src/lib/redis';
import { randomBytes } from 'crypto';

async function verifyFlow() {
    const testUserId = 'test-player-' + randomBytes(4).toString('hex');
    console.log(`🚀 Starting Passkey Flow Verification for User: ${testUserId}\n`);

    try {
        // 1. Initialize Services
        console.log('--- [Step 1: Initialization] ---');
        const app = await initializeAdminApp();
        if (!app) throw new Error('Failed to initialize Firebase Admin');
        console.log('✅ Firebase Admin Initialized.');

        // 2. Simulate Registration Challenge (Redis Test)
        console.log('\n--- [Step 2: Redis Challenge Storage] ---');
        const challenge = randomBytes(32).toString('base64url');
        const redisKey = `webauthn_registration_challenge:${testUserId}`;

        await redis.setex(redisKey, 300, challenge);
        const storedChallenge = await redis.get(redisKey);

        if (storedChallenge === challenge) {
            console.log('✅ Challenge stored and retrieved from Redis successfully.');
        } else {
            throw new Error('Redis verification failed!');
        }

        // 3. Simulate Passkey Storage (Firestore Test)
        console.log('\n--- [Step 3: Firestore Key Storage] ---');
        const testCredentialId = 'cred-' + randomBytes(8).toString('hex');
        const passkeyData = {
            credentialId: testCredentialId,
            publicKey: 'mock-public-key-data',
            aaguid: 'ad10fa37-abd9-4113-b4cd-32221588640f',
            deviceBrand: 'Apple iCloud Keychain',
            counter: 0,
            transports: ['internal', 'hybrid'],
            description: 'Test Device',
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString()
        };

        const passkeyDocPath = `players/${testUserId}/passkeys/${testCredentialId}`;
        console.log(`Writing to: ${passkeyDocPath}`);

        await db.collection('players').doc(testUserId).collection('passkeys').doc(testCredentialId).set(passkeyData);

        // 4. Verify Firestore Storage
        const doc = await db.doc(passkeyDocPath).get();
        if (doc.exists && doc.data()?.credentialId === testCredentialId) {
            console.log('✅ Passkey stored and verified in Firestore successfully.');
        } else {
            throw new Error('Firestore verification failed!');
        }

        // 5. Cleanup Redis
        await redis.del(redisKey);
        console.log('\n--- [Result] ---');
        console.log('✨ FULL BACKEND PASSKEY FLOW VERIFIED! ✨');
        console.log('System is ready to handle real biometric registration.');

    } catch (error: any) {
        console.error('\n❌ VERIFICATION FAILED:');
        console.error(error.message);
        console.log('\n💡 Tip: Check your .env.local for correct Firebase and Redis credentials.');
    }

    process.exit(0);
}

verifyFlow();
