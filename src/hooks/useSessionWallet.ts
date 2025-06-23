
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet as useActualWallet, type WalletContextState } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';

// Exclude properties from WalletContextState that we will redefine or handle differently
type BaseWalletState = Omit<WalletContextState, 'publicKey' | 'connected' | 'disconnect'>;

export interface SessionWallet extends BaseWalletState {
  sessionPublicKey: PublicKey | null; // The PublicKey of the established game session
  adapterPublicKey: PublicKey | null; // The current PublicKey from the wallet adapter (can change)
  
  isConnectedToSession: boolean;    // True if adapter is connected AND adapterPK matches sessionPK (once sessionPK is set)
  isAdapterConnected: boolean;      // True if the wallet adapter itself is connected (raw status)
  isWalletMismatch: boolean;        // True if a sessionPK is set AND adapterPK is connected but different from sessionPK
  
  disconnectFromSession: () => Promise<void>; // Custom disconnect to clear session state
}

export const useSessionWallet = (): SessionWallet => {
  const actualWallet = useActualWallet();
  const [sessionPublicKey, setSessionPublicKey] = useState<PublicKey | null>(null);

  useEffect(() => {
    // Set initial sessionPublicKey when adapter connects and no session is active
    if (actualWallet.connected && actualWallet.publicKey && !sessionPublicKey) {
      setSessionPublicKey(actualWallet.publicKey);
    }
    // Clear sessionPublicKey if adapter disconnects entirely
    // This handles cases where the disconnect happens outside our custom function (e.g. from wallet extension)
    if (!actualWallet.connected && sessionPublicKey) {
      setSessionPublicKey(null);
    }
  }, [actualWallet.connected, actualWallet.publicKey, sessionPublicKey]);

  const disconnectFromSession = useCallback(async () => {
    await actualWallet.disconnect();
    setSessionPublicKey(null); // Explicitly clear session on our disconnect call
  }, [actualWallet]);

  const isAdapterConnected = actualWallet.connected;
  const adapterPublicKey = actualWallet.publicKey;
  
  const isWalletMismatch = !!(sessionPublicKey && adapterPublicKey && isAdapterConnected && !sessionPublicKey.equals(adapterPublicKey));
  
  // Considered connected to session if:
  // 1. An adapter is connected AND
  // 2. A sessionPublicKey has been established AND
  // 3. The adapter's current public key matches the sessionPublicKey
  const isConnectedToSession = !!(isAdapterConnected && sessionPublicKey && adapterPublicKey && sessionPublicKey.equals(adapterPublicKey));

  return {
    ...actualWallet, // Spread all properties from actualWallet
    sessionPublicKey,
    adapterPublicKey,
    isConnectedToSession,
    isAdapterConnected,
    isWalletMismatch,
    disconnectFromSession, // Provide the wrapped disconnect
    // The `publicKey` and `connected` properties from `actualWallet` are now less relevant for game logic.
    // Game logic should use `sessionPublicKey` for identity and `isConnectedToSession`.
    // `actualWallet.sendTransaction` etc. will still use the `adapterPublicKey`.
  };
};
