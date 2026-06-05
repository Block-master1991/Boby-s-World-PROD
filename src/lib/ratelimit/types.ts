/**
 * Rate Limiter Module Types
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number | undefined; // Fix TS2375 by adding undefined
  currentCount?: number;
  limit?: number;
  remaining?: number;
  riskScore?: number;
  action?: "allow" | "warn" | "block" | "challenge";
}

export interface AdaptiveLimits {
  baseLimit: number;
  burstLimit: number;
  windowSize: number;
  reputationMultiplier: number;
  riskAdjustment: number;
}

export interface SuspiciousActivity {
  type:
    | "rapid_requests"
    | "unusual_pattern"
    | "bot_signature"
    | "ddos_attempt"
    | "geographic_anomaly"
    | "blacklisted_ip";
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  description: string;
  evidence: Record<string, unknown> | null; // Replaced any
}

export interface BehavioralStats {
  avgFrequency: number;
  requestCount: number;
  lastRequestTime: number;
  deviationScore: number;
}

export interface PatternAnalysisResult {
  type: SuspiciousActivity["type"];
  description: string;
  evidence: Record<string, unknown> | null;
  score: number;
}
