
import { encryptData, decryptData } from '../src/utils/encryption';
import CryptoJS from 'crypto-js';

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    bold: "\x1b[1m"
};

const pass = (msg: string) => console.log(`${colors.green}✓ PASS:${colors.reset} ${msg}`);
const fail = (msg: string) => console.log(`${colors.red}✗ FAIL:${colors.reset} ${msg}`);
const info = (msg: string) => console.log(`${colors.cyan}ℹ INFO:${colors.reset} ${msg}`);

console.log(`${colors.bold}\n🔒 Running Comprehensive Security Verification Suite...\n${colors.reset}`);

// Test Data
const originalData = [
    { id: "penalty-123", amount: 50, type: "penalty" },
    { id: "coin-456", amount: 10, type: "coin" }
];

// --- TEST CASE 1: Correctness (Round Trip) ---
try {
    const encrypted = encryptData(originalData);
    const decrypted = decryptData(encrypted);

    if (JSON.stringify(originalData) === JSON.stringify(decrypted)) {
        pass("Round-trip encryption/decryption successful.");
    } else {
        fail("Decrypted data does not match original data.");
    }
} catch (e) {
    fail(`Exception in correctness test: ${e}`);
}

// --- TEST CASE 2: Encryption Strength (Format Check) ---
try {
    const encrypted = encryptData(originalData);
    const parts = encrypted.split(':');

    if (parts.length === 3) {
        pass("Output format is correct (IV:Ciphertext:Signature).");
    } else {
        fail(`Invalid output format. Expected 3 parts, got ${parts.length}`);
    }

    if (encrypted === JSON.stringify(originalData)) {
        fail("Data was NOT encrypted (Plaintext leakage).");
    } else {
        pass("Data is obscured (No plaintext leakage).");
    }
} catch (e) {
    fail(`Exception in strength test: ${e}`);
}

// --- TEST CASE 3: Integrity Check (Tampering Ciphertext) ---
try {
    const encrypted = encryptData(originalData);
    const parts = encrypted.split(':');

    // Tamper with the ciphertext (middle part)
    // We change the last character of the ciphertext
    const tamperedCipher = parts[1].substring(0, parts[1].length - 4) + "AAAA";
    const tamperedPayload = `${parts[0]}:${tamperedCipher}:${parts[2]}`; // Keep valid signature

    // NOTE: In our implementation, we sign (IV:Ciphertext).
    // So if Ciphertext changes, the signature MUST mismatch.

    const decrypted = decryptData(tamperedPayload);

    if (decrypted === null) {
        pass("Tampered ciphertext correctly rejected (Integrity check passed).");
    } else {
        fail("Tampered ciphertext was accepted! (Integrity check FAILED).");
    }
} catch (e) {
    fail(`Exception in ciphertext verify test: ${e}`);
}

// --- TEST CASE 4: Integrity Check (Tampering Signature) ---
try {
    const encrypted = encryptData(originalData);
    const parts = encrypted.split(':');

    // Tamper with the signature (last part)
    const tamperedSig = "dGhpcyBpcyBhIGZha2Ugc2lnbmF0dXJl"; // "this is a fake signature" in base64
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedSig}`;

    const decrypted = decryptData(tamperedPayload);

    if (decrypted === null) {
        pass("Invalid signature correctly rejected.");
    } else {
        fail("Invalid signature accepted! (Signature verification FAILED).");
    }
} catch (e) {
    fail(`Exception in signature verify test: ${e}`);
}

// --- TEST CASE 5: Semantic Security (Same data, different ciphertext) ---
try {
    // Encrypting the same data twice should produce DIFFERENT outputs due to random IV
    const run1 = encryptData(originalData);
    const run2 = encryptData(originalData);

    if (run1 !== run2) {
        pass("Semantic security verified (Different outputs for same input).");
    } else {
        fail("Semantic security FAILED (Same IV used? Output is identical).");
        info(`Run 1: ${run1.substring(0, 20)}...`);
        info(`Run 2: ${run2.substring(0, 20)}...`);
    }
} catch (e) {
    fail(`Exception in iv test: ${e}`);
}

console.log(`${colors.bold}\nVerification Complete.\n${colors.reset}`);
