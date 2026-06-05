export type PurchasePhase =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "sending"
  | "confirming"
  | "verifying"
  | "complete"
  | "error";

export interface PurchaseProgress {
  phase: PurchasePhase;
  message: string;
  signature?: string;
  explorerUrl?: string;
  error?: string;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  explorerUrl?: string;
  error?: string;
  confirmationStatus?: string;
}

export interface PriorityFeeConfig {
  computeUnitLimit?: number;
  computeUnitPrice?: number; // microLamports per compute unit
}
