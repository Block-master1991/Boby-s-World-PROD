export interface TamperDetectionConfig {
  enabled: boolean;
  algorithm?: "sha256" | "sha512" | undefined;
  includeChain?: boolean | undefined;
  alertOnTampering?: boolean | undefined;
}

/**
 * Signed log entry
 */
export interface SignedLogEntry {
  data: unknown;
  hash: string;
  previousHash?: string | undefined;
  timestamp: number;
  sequence: number;
  signature: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  entry: SignedLogEntry;
  errors: string[];
}
