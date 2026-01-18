/**
 * WebAuthn Utility Test Script
 * Tests the cryptographic and logic functions of WebAuthnUtils
 */

import assert from 'assert';
import { WebAuthnUtils } from '../src/lib/webauthn-utils.js';

function runTests() {
    console.log('🧪 Starting WebAuthn Utility Tests...');

    try {
        // 1. Test RP ID Extraction
        console.log('Testing RP ID extraction...');
        assert.strictEqual(WebAuthnUtils.getRPID('localhost'), 'localhost');
        assert.strictEqual(WebAuthnUtils.getRPID('app.bobysworld.com'), 'bobysworld.com');
        assert.strictEqual(WebAuthnUtils.getRPID('server.test.local'), 'test.local');
        console.log('✅ RP ID tests passed.');

        // 2. Test Registration Challenge Generation
        console.log('Testing Registration Challenge generation...');
        const userId = 'user-123';
        const userName = 'BobyPlayer';
        const challenge = WebAuthnUtils.generateRegistrationChallenge(userId, userName, 'localhost');

        assert.strictEqual(challenge.rp.id, 'localhost');
        assert.strictEqual(challenge.user.name, userName);
        assert.ok(challenge.challenge.length > 30);
        console.log('✅ Registration Challenge tests passed.');

        // 3. Test Authenticator Name Mapping
        console.log('Testing Authenticator Name mapping...');
        assert.strictEqual(WebAuthnUtils.getAuthenticatorName('ad10fa37-abd9-4113-b4cd-32221588640f'), 'Apple iCloud Keychain');
        assert.strictEqual(WebAuthnUtils.getAuthenticatorName('invalid-guid'), 'WebAuthn Device');
        assert.strictEqual(WebAuthnUtils.getAuthenticatorName(undefined), 'Standard Biometric');
        console.log('✅ Authenticator Name tests passed.');

        // 4. Test AAGUID Extraction (Mocked AuthData)
        console.log('Testing AAGUID extraction...');
        // Correct AAGUID extraction requires 53+ bytes. 
        // Bytes 37-52 are AAGUID.
        const mockAuthData = Buffer.alloc(60);
        const testAAGUID = Buffer.from('ad10fa37abd94113b4cd32221588640f', 'hex');
        testAAGUID.copy(mockAuthData, 37);
        const extracted = WebAuthnUtils.extractAAGUID(mockAuthData.toString('base64url'));
        assert.strictEqual(extracted, 'ad10fa37-abd9-4113-b4cd-32221588640f');
        console.log('✅ AAGUID extraction tests passed.');

        console.log('\n✨ All WebAuthn Utility tests passed successfully!');
    } catch (error) {
        console.error('\n❌ Test failed:');
        console.error(error);
        process.exit(1);
    }
}

runTests();
