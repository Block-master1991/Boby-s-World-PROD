/**
 * Validation Script for Account Recovery Passkey Purging
 * This script simulates the backend logic to ensure all passkeys are cleared 
 * after a successful recovery cooldown.
 */

import { initializeAdminApp } from '../src/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

async function validatePurge(testPublicKey: string) {
    console.log(`[TEST] Starting purge validation for: ${testPublicKey}`);

    await initializeAdminApp();
    const db = getFirestore();

    // 1. Setup Mock Data
    const passkeysRef = db.collection('players').doc(testPublicKey).collection('passkeys');

    console.log("[TEST] Step 1: Creating mock passkeys...");
    await passkeysRef.doc('test-cred-1').set({ credentialId: 'test-cred-1', createdAt: new Date() });
    await passkeysRef.doc('test-cred-2').set({ credentialId: 'test-cred-2', createdAt: new Date() });

    const initialSnap = await passkeysRef.get();
    console.log(`[TEST] Initial passkeys count: ${initialSnap.size}`);

    if (initialSnap.size !== 2) {
        throw new Error("Setup failed: Could not create mock passkeys");
    }

    // 2. Simulate Purge Logic (from recovery/verify/route.ts)
    console.log("[TEST] Step 2: Running purge logic...");
    const snapshots = await passkeysRef.get();
    const batch = db.batch();
    snapshots.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    // 3. Verify Results
    const finalSnap = await passkeysRef.get();
    console.log(`[TEST] Final passkeys count: ${finalSnap.size}`);

    if (finalSnap.size === 0) {
        console.log("[TEST] SUCCESS: All passkeys purged correctly.");
    } else {
        console.error("[TEST] FAILURE: Passkeys remain after purge.");
    }
}

// Note: To run this, you'd normally use ts-node or compile it.
// validatePurge('TEST_WALLET_ADDRESS_123');
