'use client';

import type { PublicKey } from '@solana/web3.js';
import { AlertCircle, Info } from 'lucide-react';
import React from 'react';

interface MenuBannersProps {
  isWalletMismatch: boolean;
  isAuthenticated: boolean;
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
}

export const MenuBanners: React.FC<MenuBannersProps> = ({
  isWalletMismatch,
  isAuthenticated,
  sessionPublicKey,
  adapterPublicKey,
}) => (
  <>
    {isWalletMismatch && sessionPublicKey && adapterPublicKey && (
      <div className="mt-2 p-2 text-xs bg-destructive/10 text-destructive rounded-md border border-destructive/30">
        <p className="font-semibold flex items-center gap-1"><AlertCircle size={14} /> Wallet Mismatch!</p>
        <p>Connected wallet ({`${adapterPublicKey.toBase58().substring(0, 4)}...${adapterPublicKey.toBase58().substring(adapterPublicKey.toBase58().length - 4)}`}) </p>
        <p>differs from authenticated session ({`${sessionPublicKey.toBase58().substring(0, 4)}...${sessionPublicKey.toBase58().substring(sessionPublicKey.toBase58().length - 4)}`}).</p>
        <p className="mt-1">Please switch wallet in extension or reconnect.</p>
      </div>
    )}
    {!isAuthenticated && (
      <div className="mt-2 p-2 text-xs bg-yellow-500/10 text-yellow-500 rounded-md border border-yellow-500/30">
        <p className="font-semibold flex items-center gap-1"><Info size={14} /> Not Authenticated</p>
        <p>Please connect and authenticate your wallet to access all features.</p>
      </div>
    )}
  </>
);
