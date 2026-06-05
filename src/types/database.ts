import type { Timestamp as AdminTimestamp, FieldValue } from "firebase-admin/firestore";

/**
 * Flexible type for Firestore timestamps that supports both read (Timestamp)
 * and write (FieldValue/string) operations.
 */
export type TimestampProperty = AdminTimestamp | FieldValue | string;

/**
 * Firestore Collection Names
 * Use these constants to ensure consistency across the project.
 */
export const COLLECTIONS = {
  PLAYERS: "players",
  PASSKEYS: "passkeys", // Subcollection of players
  STORE_ITEMS: "storeItems",
  USED_TRANS_SIGS: "usedTransactionSignatures",
  REVOKED_TOKENS: "revokedAuthTokens",
  ENCRYPTION_KEYS: "userEncryptionKeys",
  WHITELIST: "ratelimit_whitelist",
  BLACKLIST: "ratelimit_blacklist",
  AUDIT_LOGS: "security_audit_logs",
  CSRF_TOKENS: "csrfTokens",
} as const;

/**
 * Player data stored in the 'players' collection.
 */
export interface PlayerDocument {
  gameUSDTBalance: number;
  lastInteraction: TimestampProperty;
  publicKey: string;
  lastProcessedBatchId?: string;
  inventory?: InventoryItem[];
  updatedAt?: TimestampProperty;
  lastLogin?: TimestampProperty;
  createdAt?: TimestampProperty;
  [key: string]: unknown;
}

/**
 * Player inventory item structure.
 */
export interface InventoryItem {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  price?: number;
  image?: string;
  type?: "consumable" | "permanent";
  rarity?: "common" | "rare" | "epic" | "legendary";
  quantity?: number;
}

/**
 * WebAuthn Passkey stored in 'players/{userId}/passkeys' subcollection.
 */
export interface PasskeyDocument {
  credentialId: string;
  publicKey: string;
  aaguid: string | null;
  deviceBrand: string;
  counter: number;
  transports: string[];
  description: string;
  createdAt: string; // ISO string
  lastUsedAt: string; // ISO string
}

/**
 * Store items available in the shop.
 */
export interface StoreItemDocument {
  id: string;
  name: string;
  description: string;
  price: number;
  usdPrice: number;
  image: string;
  dataAiHint: string;
  type: "consumable" | "permanent";
  rarity: "common" | "rare" | "epic" | "legendary";
  isActive: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

/**
 * Security Audit Log Entry stored in 'security_audit_logs' collection.
 */
export interface AuditLogDocument {
  eventType: string;
  severity: "info" | "warn" | "error" | "critical";
  message: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  environment: string;
  correlationId?: string;
  encrypted?: boolean;
  signature?: string;
  complianceLevel?: "GDPR" | "CCPA" | "SOC2" | "HIPAA";
}

/**
 * Used transaction signature to prevent replay attacks.
 */
export interface TransactionSignatureDocument {
  userId: string;
  itemId: string;
  quantity: number;
  timestamp: TimestampProperty;
  itemName?: string;
  amountPaid?: number;
}

/**
 * User encryption keys stored in 'userEncryptionKeys' collection.
 */
export interface UserKeyDocument {
  encryptedKey: string;
  userId: string;
  createdAt: TimestampProperty;
  [key: string]: unknown;
}

/**
 * Blacklisted tokens stored in 'revokedAuthTokens' collection.
 */
export interface BlacklistedTokenDocument {
  jti: string;
  exp: number;
  reason: "logout" | "security_breach" | "expired" | string;
  revokedAt: TimestampProperty;
}

/**
 * CSRF token storage.
 */
export interface CsrfTokenDocument {
  token: string;
  expiry: number;
  createdAt: TimestampProperty;
}

/**
 * Rate limit records (whitelist/blacklist)
 */
export interface RateLimitDocument {
  addedAt: TimestampProperty;
  reason?: string;
  blockedAt?: string; // ISO string
  source?: string;
}
