import { timingSafeEqual } from "crypto";
import { calculateDistance, calculateRiskScore } from "./risk";
import { generateAdvancedDeviceFingerprint } from "./security";
import type { DeviceInfo, GeoLocation, SessionData } from "./types";

export interface SessionCheckOptions {
  session: SessionData;
  deviceInfo: DeviceInfo;
  expireSession: (id: string) => Promise<boolean>;
  updateFingerprintMapping: (id: string, oldF: string, newF: string) => Promise<void>;
  loc?: GeoLocation | undefined;
}

/**
 * Validates session and checks for security violations
 */
export async function performSessionChecks(
  options: SessionCheckOptions
): Promise<{ valid: boolean; reason?: string }> {
  const { session, deviceInfo, expireSession, updateFingerprintMapping, loc } = options;

  // Fingerprint check
  const currentFingerprint = generateAdvancedDeviceFingerprint(deviceInfo);
  if (session.deviceFingerprint !== currentFingerprint) {
    const riskScore = calculateRiskScore(deviceInfo);
    if (riskScore > 70) {
      // RISK_THRESHOLD
      await expireSession(session.sessionId);
      return {
        valid: false,
        reason: "Security violation: Device fingerprint mismatch with high risk score",
      };
    }
    await updateFingerprintMapping(
      session.sessionId,
      session.deviceFingerprint,
      currentFingerprint
    );
    session.deviceFingerprint = currentFingerprint;
  }

  // Location check
  if (loc && session.location) {
    if (calculateDistance(session.location, loc) > 500) {
      session.riskScore += 20;
    }
  }

  if (session.riskScore > 100) {
    await expireSession(session.sessionId);
    return { valid: false, reason: "Very high risk level" };
  }

  return { valid: true };
}

/**
 * Secure string comparison to prevent timing attacks
 */
export function safeCompare(a: string, b: string): boolean {
  try {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}
