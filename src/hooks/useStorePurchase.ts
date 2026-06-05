"use client";

import { useToast } from "@/hooks/use-toast";
import type { StoreItemDefinition } from "@/lib/server-items";
import { solanaPaymentService, type PurchaseProgress } from "@/lib/solanaPaymentService";
import { WebAuthnTransactionSigner } from "@/lib/WebAuthnTransactionSigner";
import { useApiFetch } from "@/utils/api";
import { uint8ArrayToBase64url } from "@/utils/base64";
import { logger } from "@/utils/logger";
import {
  buildBobyPurchaseTransaction,
  pollTransactionConfirmation,
  verifyPurchaseWithBackend,
} from "@/utils/solanaPurchaseHelpers";
import type { AuthSig, VerificationPayload } from "@/utils/solanaPurchaseHelpers";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { useCallback, useState } from "react";

interface StepUpAuthResult {
  id: string;
  response: {
    authenticatorData: ArrayBuffer;
    clientDataJSON: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle?: ArrayBuffer | null;
  };
}

interface UseStorePurchaseProps {
  isAuthenticated: boolean;
  isWalletConnectedAndMatching: boolean;
  authUserPublicKey: string | undefined;
  wallet: { publicKey: PublicKey | null } | null;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  connection: Connection;
  adapterPublicKey: PublicKey | null;
  isWalletMismatch: boolean;
  isMobile: boolean;
  bobyUsdPrice: number | null;
  onPurchaseSuccess: (() => Promise<void>) | undefined;
  hasPasskey?: boolean;
  totpEnabled?: boolean;
  onTOTPRequired?: () => Promise<string | null>;
}

interface PurchaseContext extends UseStorePurchaseProps {
  toast: ReturnType<typeof useToast>["toast"];
  apiFetch: ReturnType<typeof useApiFetch>["apiFetch"];
  setProgress: (p: PurchaseProgress) => void;
  setIsLoading: (id: string | null) => void;
  maxRetries: number;
}

interface FlowOps {
  it: StoreItemDefinition;
  qty: number;
  amt: number;
  auth: AuthSig | undefined;
  r: number;
  signature?: string | undefined;
  totpToken?: string | undefined;
}

/**
 * Helpers moved outside the hook to satisfy line-count limits
 */
const performStepUpAuth = async (
  ctx: PurchaseContext,
  item: StoreItemDefinition,
  qty: number,
  amt: number
): Promise<AuthSig | undefined> => {
  if (!("PublicKeyCredential" in window)) return undefined;

  ctx.toast({
    title: "Security Verification",
    description: "Please verify your identity using your device Passkey/PIN to continue.",
  });

  try {
    const pl = {
      action: "PURCHASE_ITEM",
      itemId: item.id,
      quantity: qty,
      amount: amt,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2),
    };

    const res = (await WebAuthnTransactionSigner.signTransaction(pl)) as StepUpAuthResult | null;
    if (!res) return undefined;

    return {
      id: res.id,
      response: {
        authenticatorData: uint8ArrayToBase64url(new Uint8Array(res.response.authenticatorData)),
        clientDataJSON: uint8ArrayToBase64url(new Uint8Array(res.response.clientDataJSON)),
        signature: uint8ArrayToBase64url(new Uint8Array(res.response.signature)),
        userHandle: res.response.userHandle
          ? uint8ArrayToBase64url(new Uint8Array(res.response.userHandle))
          : null,
      },
      payload: pl,
    };
  } catch (error) {
    logger.error("Step-up auth error:", error);
    ctx.toast({
      title: "Verification Cancelled",
      description: "Security check is required for this transaction.",
      variant: "destructive",
    });
    return undefined;
  }
};

const handleFailure = (
  ctx: PurchaseContext,
  e: unknown,
  sig: string | undefined,
  retry: () => void
): void => {
  const msg = e instanceof Error ? e.message : "Failed.";
  if ((msg.includes("Timeout") || msg.includes("rejected")) && sig === undefined) {
    ctx.toast({ title: "Retrying..." });
    setTimeout(() => {
      retry();
    }, 2000);
    return;
  }
  const state: PurchaseProgress = { phase: "error", message: "Failed", error: msg };
  if (sig) {
    state.signature = sig;
    state.explorerUrl = solanaPaymentService.getExplorerUrl(sig);
  }
  ctx.setProgress(state);
  ctx.toast({ title: "Error", description: msg, variant: "destructive" });
};

const runFlow = async (ctx: PurchaseContext, ops: FlowOps): Promise<void> => {
  let sig: string | undefined = ops.signature;
  const { it, qty, amt, auth, r } = ops;
  try {
    if (!sig) {
      ctx.setProgress({ phase: "preparing", message: "Preparing transaction..." });
      if (!ctx.adapterPublicKey) throw new Error("Wallet not connected.");
      const tx = await buildBobyPurchaseTransaction(ctx.connection, ctx.adapterPublicKey, amt);

      ctx.setProgress({ phase: "awaiting_signature", message: "Please sign in your wallet..." });
      sig = await Promise.race([
        ctx.sendTransaction(tx, ctx.connection),
        new Promise<never>((_, rj) =>
          setTimeout(
            () => {
              rj(new Error("Transaction Timeout"));
            },
            ctx.isMobile ? 90000 : 60000
          )
        ),
      ]);
    }

    ctx.setProgress({
      phase: "confirming",
      message: "Confirming on blockchain...",
      signature: sig,
      explorerUrl: solanaPaymentService.getExplorerUrl(sig),
    });
    if (!(await pollTransactionConfirmation(ctx.connection, sig)))
      throw new Error("Transaction confirmation timeout.");

    ctx.setProgress({ phase: "verifying", message: "Finalizing purchase..." });
    const { ok, data } = await verifyPurchaseWithBackend(
      ctx.apiFetch,
      {
        itemId: it.id,
        quantity: qty,
        transactionSignature: sig,
        transactionAuthSignature: auth,
        totpToken: ops.totpToken,
      } as VerificationPayload,
      ctx.isMobile
    );

    if (ok) {
      ctx.setProgress({ phase: "complete", message: "Purchase Successful!", signature: sig });
      ctx.toast({ title: "Success", description: `Purchased ${qty}x ${it.name}` });
      if (ctx.onPurchaseSuccess) await ctx.onPurchaseSuccess();
    } else if (data.code === "TRANSACTION_NOT_FOUND" && r < ctx.maxRetries) {
      setTimeout(() => {
        runFlow(ctx, { ...ops, r: r + 1, signature: sig });
      }, 8000);
    } else if (data.error?.includes("Passkey verification required") && !auth) {
      ctx.toast({ title: "Security Required", description: "Passkey verification is needed." });
      const newAuth = await performStepUpAuth(ctx, it, qty, amt);
      if (newAuth) {
        await runFlow(ctx, { ...ops, auth: newAuth, signature: sig });
      } else {
        throw new Error(data.error);
      }
    } else if (data.error?.includes("TOTP verification required") && !ops.totpToken) {
      if (ctx.onTOTPRequired) {
        const token = await ctx.onTOTPRequired();
        if (token) {
          await runFlow(ctx, { ...ops, totpToken: token, signature: sig });
        } else {
          throw new Error("TOTP verification cancelled.");
        }
      } else {
        throw new Error("TOTP verification required but no handler provided.");
      }
    } else throw new Error(data.error || "Server error.");
  } catch (e) {
    handleFailure(ctx, e, sig, () => {
      runFlow(ctx, { ...ops, r: r + 1, signature: sig });
    });
  }
};

/**
 * useStorePurchase - Manages Solana item purchases with ultimate line-count compliance
 */
export const useStorePurchase = (props: UseStorePurchaseProps) => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [purchaseProgress, setPurchaseProgress] = useState<PurchaseProgress>({
    phase: "idle",
    message: "",
  });
  const { toast } = useToast();
  const { apiFetch } = useApiFetch();

  const handlePurchase = useCallback(
    async (it: StoreItemDefinition, qty: number): Promise<void> => {
      const ctx: PurchaseContext = {
        ...props,
        toast,
        apiFetch,
        setProgress: setPurchaseProgress,
        setIsLoading,
        maxRetries: props.isMobile ? 2 : 1,
      };
      if (
        !ctx.isAuthenticated ||
        !ctx.isWalletConnectedAndMatching ||
        !ctx.wallet ||
        ctx.isWalletMismatch ||
        !ctx.bobyUsdPrice ||
        ctx.bobyUsdPrice <= 0
      ) {
        toast({ title: "Error", variant: "destructive" });
        return;
      }
      const amt = (it.price * qty) / ctx.bobyUsdPrice;
      setIsLoading(it.id);
      try {
        // Priority 1: AuthContext state, Priority 2: localStorage fallback
        const userHasPasskey =
          ctx.hasPasskey ||
          (typeof window !== "undefined" &&
            localStorage.getItem("boby_world_passkey_registered") === "true");

        let auth: AuthSig | undefined = undefined;
        if (userHasPasskey) {
          auth = await performStepUpAuth(ctx, it, qty, amt);
          if (!auth) {
            setIsLoading(null);
            return;
          }
        } else if (ctx.totpEnabled && ctx.onTOTPRequired) {
          const token = await ctx.onTOTPRequired();
          if (!token) {
            setIsLoading(null);
            return;
          }
          await runFlow(ctx, { it, qty, amt, auth: undefined, totpToken: token, r: 0 });
          return;
        }

        await runFlow(ctx, { it, qty, amt, auth, r: 0 });
      } catch (e) {
        logger.error(e instanceof Error ? e.message : String(e));
        toast({
          title: "Purchase Error",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(null);
      }
    },
    [props, toast, apiFetch]
  );

  return { handlePurchase, isLoading, purchaseProgress, setPurchaseProgress };
};
