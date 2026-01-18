'use client';

import { Wallet } from 'lucide-react';
import React from 'react';

interface AuthenticatedWalletInfoProps {
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
}

export const AuthenticatedWalletInfo: React.FC<AuthenticatedWalletInfoProps> = ({
  isAuthenticated,
  authUserPublicKey,
}) => (
  <>
    {isAuthenticated && authUserPublicKey && (
      <div className="text-xs text-muted-foreground p-2 border rounded-md bg-background/50 text-center break-all">
        <p className="font-semibold mb-1 flex items-center justify-center gap-1">
          <Wallet className="h-4 w-4" />
          Authenticated Wallet: {`${authUserPublicKey.substring(0, 4)}...${authUserPublicKey.substring(authUserPublicKey.length - 4)}`}
        </p>
      </div>
    )}
  </>
);
