import type { SampledLogEntry } from "../types/SamplingTypes";

/**
 * Pre-defined priority rules
 */
export const commonPriorityRules = {
  // Always log errors and above
  alwaysLogErrors: (entry: SampledLogEntry): boolean => {
    const level = entry.level.toLowerCase();
    return ["error", "fatal", "critical"].includes(level);
  },

  // Always log security events
  alwaysLogSecurity: (entry: SampledLogEntry): boolean => {
    const isSecurityMetadata = entry.metadata?.["security"] === true;
    const isSecurityEvent =
      typeof entry.metadata?.["eventType"] === "string" &&
      (entry.metadata["eventType"] as string).includes("SECURITY");

    return isSecurityMetadata || entry.message.includes("SECURITY") || isSecurityEvent;
  },

  // Always log audit events
  alwaysLogAudit: (entry: SampledLogEntry): boolean => {
    const isAuditMetadata = entry.metadata?.["audit"] === true;
    return isAuditMetadata || entry.message.includes("AUDIT");
  },

  // Never log health checks
  neverLogHealthChecks: (entry: SampledLogEntry): boolean => {
    const message = entry.message.toLowerCase();
    return !message.includes("health") && !message.includes("ping");
  },

  // Sample high-frequency events less
  sampleHighFrequency: (entry: SampledLogEntry): boolean => {
    const gameLoop = entry.metadata?.["gameLoop"] === true;
    const highFreq = entry.message.includes("[HIGH_FREQ]");
    return !gameLoop && !highFreq;
  },
};
