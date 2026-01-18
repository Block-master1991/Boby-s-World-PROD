/**
 * Session Security Utilities
 */

import { createHash, randomBytes } from 'crypto';
import { logger } from 'utils/logger';
import { keyVault } from '../keyVaultService';
import type { DeviceInfo } from './types';

/**
 * Generate advanced device fingerprint (Synchronous as logic permits)
 */
export function generateAdvancedDeviceFingerprint(deviceInfo: DeviceInfo): string {
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
export async function generateDeviceBindingKey(deviceFingerprint: string): Promise<string> {
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
    } catch {
        logger.warn('[SessionManager] Failed to create device binding key, using simple hash');
        return createHash('sha256').update(`${deviceFingerprint}device-binding`).digest('hex');
    }
}

/**
 * Generate high-quality entropy (Synchronous as logic permits)
 */
export function generateHighEntropy(entropyBits: number = 256): string {
    const entropyPool = new Uint8Array(entropyBits / 8);
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
export function generateSecureSessionId(): string {
    const sessionBytes = randomBytes(32);
    const timestampBytes = new DataView(new ArrayBuffer(8));
    timestampBytes.setBigInt64(0, BigInt(Date.now()));

    const combined = new Uint8Array(40);
    combined.set(sessionBytes, 0);
    combined.set(new Uint8Array(timestampBytes.buffer), 32);

    return createHash('sha256').update(combined).digest('hex');
}
