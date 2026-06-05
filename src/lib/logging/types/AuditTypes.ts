export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "SESSION_VIOLATION"
  | "RATE_LIMIT_HIT"
  | "CSRF_VIOLATION"
  | "PASSKEY_REGISTERED"
  | "PASSKEY_LOGIN_SUCCESS"
  | "PASSKEY_LOGIN_FAILURE"
  | "SUSPICIOUS_ACTIVITY"
  | "TOKEN_REFRESH"
  | "SESSION_EXPIRED"
  | "TRANSACTION"
  | "ACCOUNT_RECOVERY_INITIATED"
  | "PASSKEY_DELETED"
  | "ADMIN_ACTION"
  | "DATA_ACCESS"
  | "DATA_MODIFICATION"
  | "DATA_DELETION"
  | "CONFIG_CHANGE"
  | "PRIVILEGE_ESCALATION";

export type AuditSeverity = "info" | "warn" | "error" | "critical";

export type ComplianceLevel = "GDPR" | "CCPA" | "SOC2" | "HIPAA";

export interface AuditEventMetadata {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  endpoint?: string;
  errorDetails?: string;
  complianceFlags?: string[];
  [key: string]: unknown; // Changed from any to unknown for strictness
}

export interface EnhancedAuditLogEntry {
  eventType: AuditEventType;
  severity: AuditSeverity;
  message: string;
  metadata: AuditEventMetadata;
  timestamp: number;
  environment: string;
  correlationId?: string | undefined;
  encrypted?: boolean | undefined;
  signature?: string | undefined;
  complianceLevel?: ComplianceLevel | undefined;
}

export interface AuditLoggerConfig {
  enableEncryption?: boolean | undefined;
  enableTamperDetection?: boolean | undefined;
  enableRateLimiting?: boolean | undefined;
  storage?: "firestore" | "file" | "database" | "memory" | undefined;
  retention?:
    | {
        enabled: boolean;
        days: number;
      }
    | undefined;
}

export interface LogEventParams {
  eventType: AuditEventType;
  message: string;
  metadata?: AuditEventMetadata | undefined;
  severity?: AuditSeverity | undefined;
  complianceLevel?: ComplianceLevel | undefined;
}
