"use client";

import { logger } from "@/utils/logger";
import {
  useWallet as useActualWallet,
  type WalletContextState,
} from "@solana/wallet-adapter-react";
import type { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

// Exclude properties from WalletContextState that we will redefine or handle differently
type BaseWalletState = Omit<WalletContextState, "publicKey" | "connected" | "disconnect">;

export interface SessionWallet extends BaseWalletState {
  sessionPublicKey: PublicKey | null; // The PublicKey of the established game session
  adapterPublicKey: PublicKey | null; // The current PublicKey from the wallet adapter (can change)

  isConnectedToSession: boolean; // True if adapter is connected AND adapterPK matches sessionPK (once sessionPK is set)
  isAdapterConnected: boolean; // True if the wallet adapter itself is connected (raw status)
  isWalletMismatch: boolean; // True if a sessionPK is set AND adapterPK is connected but different from sessionPK

  disconnectFromSession: () => Promise<void>; // Custom disconnect to clear session state
}

/**
 * Internal hook to manage session public key synchronization with the wallet adapter.
 */
const useSessionSync = (actualWallet: WalletContextState) => {
  const [sessionPublicKey, setSessionPublicKey] = useState<PublicKey | null>(null);

  useEffect(() => {
    // Set initial sessionPublicKey when adapter connects and no session is active
    if (actualWallet.connected && actualWallet.publicKey && !sessionPublicKey) {
      setSessionPublicKey(actualWallet.publicKey);
    }
    // Clear sessionPublicKey if adapter disconnects entirely
    if (!actualWallet.connected && sessionPublicKey) {
      setSessionPublicKey(null);
    }
  }, [actualWallet.connected, actualWallet.publicKey, sessionPublicKey]);

  return { sessionPublicKey, setSessionPublicKey };
};

export const useSessionWallet = (): SessionWallet => {
  const actualWallet = useActualWallet();
  const { sessionPublicKey, setSessionPublicKey } = useSessionSync(actualWallet);

  const disconnectFromSession = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("walletName");
        logger.log("[useSessionWallet] Cleared walletName from localStorage");
      }
      await actualWallet.disconnect();
    } catch (error) {
      logger.error("[useSessionWallet] Error disconnecting:", error);
    } finally {
      setSessionPublicKey(null);
    }
  }, [actualWallet, setSessionPublicKey]);

  const adapterPublicKey = actualWallet.publicKey;
  const isAdapterConnected = actualWallet.connected;

  // Derived state calculations
  const isWalletMismatch = !!(
    sessionPublicKey &&
    adapterPublicKey &&
    isAdapterConnected &&
    !sessionPublicKey.equals(adapterPublicKey)
  );

  const isConnectedToSession = !!(
    isAdapterConnected &&
    sessionPublicKey &&
    adapterPublicKey &&
    sessionPublicKey.equals(adapterPublicKey)
  );

  return {
    ...actualWallet,
    sessionPublicKey,
    adapterPublicKey,
    isConnectedToSession,
    isAdapterConnected,
    isWalletMismatch,
    disconnectFromSession,
  };
};
