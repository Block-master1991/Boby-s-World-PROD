/**
 * Input Validation Schemas using Zod
 * Provides type-safe validation for all API endpoints
 */

import { z } from "zod";

// Helper for base string validation
const baseString = (minLength: number, maxLength: number) =>
  z.string().min(minLength).max(maxLength);

// Sanitization function
const sanitize = (str: string) => str.replace(/<[^>]*>?/gm, "").trim();

// Solana public key validation (Base58, 32-44 characters)
const SolanaPublicKeySchema = baseString(32, 44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana public key")
  .transform(sanitize);

// Nonce validation (64 character hex string from SHA256/RandomBytes)
const NonceSchema = baseString(64, 64)
  .regex(/^[0-9a-f]{64}$/i, "Invalid nonce format")
  .transform(sanitize);

// Signature validation (hex string, 128 characters for ed25519)
const SignatureSchema = baseString(128, 128)
  .regex(/^[0-9a-f]{128}$/i, "Invalid signature format")
  .transform(sanitize);

// ===== Authentication Schemas =====

export const LoginRequestSchema = z.object({
  publicKey: SolanaPublicKeySchema,
  signature: SignatureSchema,
  nonce: NonceSchema,
});

export const NonceRequestSchema = z.object({
  publicKey: SolanaPublicKeySchema,
});

export const LogoutRequestSchema = z.object({
  publicKey: SolanaPublicKeySchema.optional(),
});

// ===== WebAuthn Schemas =====

/**
 * Validates initiation of registration
 */
export const WebAuthnRegisterSchema = z.object({
  userId: z.string().min(32, "Valid User ID required"),
  userName: z.string().min(1, "User name required").max(100),
});

/**
 * Validates passkey registration confirmation
 */
export const WebAuthnConfirmSchema = z.object({
  credential: z.object({
    id: z.string().min(1),
    publicKey: z.string().min(1, "Public key is required"),
    authData: z.string().optional(),
  }),
  description: z.string().max(100).optional(),
  transports: z.array(z.string()).optional(),
});

/**
 * Validates initiation of authentication (Login)
 */
export const WebAuthnAuthenticateSchema = z.object({
  userId: z.string().optional(),
});

/**
 * Validates passkey signature verification
 */
export const WebAuthnVerifySchema = z.object({
  userId: z.string().optional(),
  credentialResponse: z.object({
    id: z.string().min(1),
    response: z.record(z.string(), z.unknown()), // WebAuthn response object
    discoveryId: z.string().optional(),
  }),
});

/**
 * Validates passkey deletion and management
 */
export const WebAuthnManageDeleteSchema = z.object({
  credentialId: z.string().min(1),
});

// ===== Game-related Schemas =====

export const ApplyPenaltySchema = z.object({
  publicKey: SolanaPublicKeySchema,
  amount: z.number().int().positive().max(1000000), // Max 1M coins penalty
});

export const ConsumeBottleSchema = z.object({
  publicKey: SolanaPublicKeySchema,
});

export const PurchaseItemSchema = z.object({
  publicKey: SolanaPublicKeySchema,
  itemId: z.string().min(1),
  quantity: z.number().int().positive().max(100).default(1),
});

export const UseItemSchema = z.object({
  publicKey: SolanaPublicKeySchema,
  itemId: z.string().min(1),
});

// ===== Admin Schemas =====

export const AdminActionSchema = z.object({
  action: z.enum(["ban_user", "unban_user", "reset_stats", "grant_coins"]),
  targetUserId: z.string().min(1),
  value: z.number().int().optional(), // For grant_coins action
});

// ===== Account Recovery Schemas =====

export const RecoveryInitiateSchema = z.object({
  email: z.string().email("Invalid email address").transform(sanitize),
  publicKey: SolanaPublicKeySchema,
});

export const RecoveryVerifySchema = z.object({
  recoveryToken: z.string().uuid("Invalid recovery token format"),
  recoveryCode: z
    .string()
    .length(6, "Recovery code must be 6 characters")
    .transform(v => v.toUpperCase()),
});

export const RecoveryCancelSchema = z.object({
  recoveryToken: z.string().uuid("Invalid recovery token format"),
});

// ===== Helper: Validate and parse request body =====

export async function validateRequestBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues
        .map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    throw new Error("Invalid request body");
  }
}

// ===== Type exports for convenience =====

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type NonceRequest = z.infer<typeof NonceRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type WebAuthnRegisterRequest = z.infer<typeof WebAuthnRegisterSchema>;
export type WebAuthnConfirmRequest = z.infer<typeof WebAuthnConfirmSchema>;
export type WebAuthnAuthenticateRequest = z.infer<typeof WebAuthnAuthenticateSchema>;
export type WebAuthnVerifyRequest = z.infer<typeof WebAuthnVerifySchema>;
export type WebAuthnManageDeleteRequest = z.infer<typeof WebAuthnManageDeleteSchema>;
export type ApplyPenaltyRequest = z.infer<typeof ApplyPenaltySchema>;
export type ConsumeBottleRequest = z.infer<typeof ConsumeBottleSchema>;
export type PurchaseItemRequest = z.infer<typeof PurchaseItemSchema>;
export type UseItemRequest = z.infer<typeof UseItemSchema>;
export type AdminActionRequest = z.infer<typeof AdminActionSchema>;
export type RecoveryInitiateRequest = z.infer<typeof RecoveryInitiateSchema>;
export type RecoveryVerifyRequest = z.infer<typeof RecoveryVerifySchema>;
export type RecoveryCancelRequest = z.infer<typeof RecoveryCancelSchema>;
