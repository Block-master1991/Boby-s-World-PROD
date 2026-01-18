/**
 * Session Module Types
 */

export interface DeviceInfo {
    userAgent: string;
    language: string;
    platform: string;
    timezone: string;
    screenResolution: string;
    colorDepth: number;
    hardwareConcurrency: number;
    deviceMemory: number;
    touchPoints: number;
    plugins: string[];
    canvas: string;
    webgl: string;
    fonts: string[];
    audioContext: string;
    battery: string;
    networkInfo: string;
}

export interface SecurityContext {
    entropy: string;
    deviceBindingKey: string;
    challenge: string;
    proof: string;
}

export interface GeoLocation {
    country: string;
    region: string;
    city: string;
    lat: number;
    lng: number;
    accuracy: number;
}

export interface SessionData {
    sessionId: string;
    userId: string;
    deviceFingerprint: string;
    createdAt: number;
    lastActivityAt: number;
    expiresAt: number;
    securityContext: SecurityContext;
    riskScore: number;
    location?: GeoLocation;
    currentSeed: string;
    previousSeed?: string;
    seedExpiresAt: number;
    isActive: boolean;
    authMethod: 'wallet' | 'biometric';
    credentialId?: string | undefined; // Fix TS2375 by adding undefined
}

export interface SessionOptions {
    timeoutMinutes?: number;
    absoluteTimeoutMinutes?: number;
    maxConcurrentSessions?: number;
    enableDeviceFingerprinting?: boolean;
    enableRiskScoring?: boolean;
    enableGeolocation?: boolean;
    authMethod?: 'wallet' | 'biometric';
    credentialId?: string;
}
