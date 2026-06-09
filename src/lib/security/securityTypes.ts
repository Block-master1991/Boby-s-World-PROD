export interface SecurityContext {
  sessionId: string;
  userId: string;
  deviceFingerprint: string;
  riskScore: number;
  securityLevel: "low" | "medium" | "high" | "critical";
  authMethod?: "wallet" | "biometric" | "totp" | "mfa";
}

export interface AuthenticationResult {
  success: boolean;
  session?: SecurityContext;
  error?: string;
  requiresChallenge?: boolean;
  rateLimitInfo?: {
    allowed: boolean;
    retryAfter?: number | undefined; // Allow undefined explicitly for strict checks
    remaining?: number | undefined;
  };
}

export interface SecurityStats {
  keyVault: { activeKeys: number; rotationTimers: number };
  sessions: {
    totalSessions: number;
    activeSessions: number;
    uniqueDevices: number;
    expiredSessions: number;
  };
  rateLimiting: {
    activeIdentifiers: number;
    reputationCacheSize: number;
    patternCacheSize: number;
  };
}
