import { initializeAdminApp } from '@/lib/firebase-admin';
import { logger } from '@/utils/logger';
import { PublicKey } from '@solana/web3.js';
import { createHash, randomBytes } from 'crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

const MAX_NONCE_ATTEMPTS = 3;

export function sha256Base64(input: string): string {
    return createHash('sha256').update(input).digest('base64');
}

async function checkFirestoreConnectivity(db: FirebaseFirestore.Firestore, docName: string): Promise<boolean> {
    try {
        await db.collection('_internal_check').doc(docName).get();
        logger.log(`[AuthNonces] Firestore connectivity check successful (${docName}).`);
        return true;
    } catch (diagError) {
        logger.error(`[AuthNonces] Firestore connectivity check FAILED (${docName}):`, diagError instanceof Error ? diagError.message : String(diagError));
        return false;
    }
}

export async function generateNonce(publicKey: string): Promise<string | null> {
    logger.log(`[AuthNonces] Called generateNonce for publicKey: ${publicKey}`);
    try {
        await initializeAdminApp();
        const db = getFirestore();
        if (!await checkFirestoreConnectivity(db, 'connectivity_generate_nonce')) return null;

        const newNonce = randomBytes(32).toString('hex');
        const expiry = Date.now() + 5 * 60 * 1000;
        const nonceRef = db.collection('authNonces').doc(publicKey);

        const existingNonce = await nonceRef.get();
        if (existingNonce.exists) {
            logger.log(`[AuthNonces] Deleting existing nonce for ${publicKey}.`);
            await nonceRef.delete();
        }

        await nonceRef.set({ nonce: newNonce, expiry, attempts: 0, createdAt: FieldValue.serverTimestamp() });
        logger.log(`[AuthNonces] Nonce ${newNonce} stored for ${publicKey}. Expiry: ${new Date(expiry).toISOString()}`);
        return newNonce;
    } catch (error) {
        logger.error(`[AuthNonces] Error in generateNonce for ${publicKey}:`, error instanceof Error ? error.message : String(error));
        return null;
    }
}

interface NonceVerifyResult { success: boolean; reason: string; }

function executeNonceTransaction(db: FirebaseFirestore.Firestore, publicKey: string, clientNonce: string): Promise<NonceVerifyResult> {
    const nonceRef = db.collection('authNonces').doc(publicKey);
    return db.runTransaction(async (transaction) => {
        const nonceDoc = await transaction.get(nonceRef);
        if (!nonceDoc.exists) return { success: false, reason: 'not_found' };

        const { nonce, expiry, attempts } = nonceDoc.data() as { nonce: string; expiry: number; attempts: number };
        if (attempts >= MAX_NONCE_ATTEMPTS) { transaction.delete(nonceRef); return { success: false, reason: 'too_many_attempts' }; }
        if (expiry < Date.now()) { transaction.delete(nonceRef); return { success: false, reason: 'expired' }; }
        if (nonce !== clientNonce) {
            const newAttempts = (attempts || 0) + 1;
            if (newAttempts >= MAX_NONCE_ATTEMPTS) { transaction.delete(nonceRef); return { success: false, reason: 'too_many_attempts_mismatch' }; }
            transaction.update(nonceRef, { attempts: newAttempts });
            return { success: false, reason: 'mismatch' };
        }
        transaction.delete(nonceRef);
        return { success: true, reason: 'consumed' };
    });
}

export async function verifyAndConsumeNonce(publicKey: string, clientNonce: string): Promise<NonceVerifyResult> {
    logger.log(`[AuthNonces] verifyAndConsumeNonce for publicKey: ${publicKey}`);
    try {
        await initializeAdminApp();
        const db = getFirestore();
        if (!await checkFirestoreConnectivity(db, 'connectivity_verify_nonce')) return { success: false, reason: 'firestore_connectivity_failed' };
        const result = await executeNonceTransaction(db, publicKey, clientNonce);
        logger.log(`[AuthNonces] Transaction for ${publicKey}: Success=${result.success}, Reason=${result.reason}`);
        return result;
    } catch (error) {
        logger.error(`[AuthNonces] Transaction error for ${publicKey}:`, error instanceof Error ? error.message : String(error));
        return { success: false, reason: 'transaction_error' };
    }
}

export function validatePublicKey(publicKey: string): boolean {
    try { new PublicKey(publicKey); return true; } catch { return false; }
}

export async function ensureFirestoreConnectivity(docId: string): Promise<NextResponse | null> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        await db.collection('_internal_check').doc(docId).get();
        logger.log(`[Login] Firestore check OK (${docId}).`);
        return null;
    } catch (diagError) {
        logger.error(`[Login] Firestore check FAILED (${docId}):`, diagError instanceof Error ? diagError.message : String(diagError));
        return NextResponse.json({ error: 'Server configuration error with database.', details: `Connectivity check failed (${docId}).` }, { status: 500 });
    }
}

export async function createOrUpdatePlayerDoc(db: FirebaseFirestore.Firestore, publicKey: string): Promise<void> {
    try {
        const playerRef = db.collection('players').doc(publicKey);
        const playerDoc = await playerRef.get();
        if (playerDoc.exists) {
            await playerRef.update({ lastLogin: FieldValue.serverTimestamp() });
        } else {
            await playerRef.set({ walletAddress: publicKey, createdAt: FieldValue.serverTimestamp(), lastLogin: FieldValue.serverTimestamp(), inventory: [], gameUSDTBalance: 0 });
        }
    } catch (dbError) {
        logger.error('[Login] Error creating/updating player doc:', dbError instanceof Error ? dbError.message : String(dbError));
    }
}
