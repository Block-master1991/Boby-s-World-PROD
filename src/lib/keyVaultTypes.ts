/**
 * KeyVault Types
 */

export interface KeyMetadata {
    id: string;
    version: number;
    algorithm: string;
    createdAt: number;
    lastRotatedAt: number;
    expiresAt: number;
    isActive: boolean;
    keyUsage: string[];
    hardwareProtected: boolean;
}

export interface KeyRotationOptions {
    autoRotate: boolean;
    rotationIntervalHours: number;
    notifyBeforeExpiry: number; // hours before expiry
}
