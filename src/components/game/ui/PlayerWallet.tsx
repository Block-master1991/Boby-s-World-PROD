'use client';

import React from 'react';
import type { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wallet, Send, Loader2, Info, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardTitle, CardContent, CardDescription as ShadCardDescription } from '@/components/ui/card';
import BobyPriceDisplay from '@/components/game/BobyPriceDisplay';
import TokenBalance from '@/components/game/TokenBalance';
import DisconnectButton from '@/components/shared/DisconnectButton';

interface PlayerWalletProps {
  isWalletMismatch: boolean;
  isAuthenticated: boolean;
  authUserPublicKey: string | undefined;
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
  isFetchingPlayerUSDT: boolean;
  playerGameUSDT: number;
  MIN_WITHDRAWAL_USDT: number;
  isWithdrawing: boolean;
  onWithdrawUSDT: () => void;
  dbAppOptionsProjectId?: string | null;
}

const PlayerWallet: React.FC<PlayerWalletProps> = ({
  isWalletMismatch,
  isAuthenticated,
  authUserPublicKey,
  sessionPublicKey,
  adapterPublicKey,
  isFetchingPlayerUSDT,
  playerGameUSDT,
  MIN_WITHDRAWAL_USDT,
  isWithdrawing,
  onWithdrawUSDT,
  dbAppOptionsProjectId
}) => {
  const firebaseNotConfigured = !dbAppOptionsProjectId || dbAppOptionsProjectId.includes("YOUR_PROJECT_ID");

  return (
    <>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="text-2xl font-headline flex items-center gap-2">
          <img src="/wallet.png" alt="Wallet Icon" className="h-7 w-7" /> Player Wallet
        </SheetTitle>
        <BobyPriceDisplay />
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
      </SheetHeader>
      <ScrollArea className="flex-grow">
        <div className="p-4 space-y-3">
          <TokenBalance />
          <Separator className="my-3" />
          <Card className="bg-secondary/30">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-md font-headline flex items-center gap-2">
                <Image src="/USDT-logo.png" alt="USDT Icon" width={20} height={20} className="h-5 w-5" /> In-Game USDT Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-1">
              {isFetchingPlayerUSDT ? (<Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />) : (
                <p className="text-2xl font-bold text-center text-primary">{playerGameUSDT.toFixed(4)} USDT</p>
              )}
              <Button className="w-full mt-3 text-sm py-2" onClick={onWithdrawUSDT}
                disabled={playerGameUSDT < MIN_WITHDRAWAL_USDT || isWithdrawing || isFetchingPlayerUSDT || isWalletMismatch || firebaseNotConfigured}>
                {isWithdrawing ? <Loader2 className="mr-2 rtl:ml-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 rtl:ml-2 h-4 w-4" />}
                Withdraw {MIN_WITHDRAWAL_USDT} USDT (Min)
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">Withdrawals are simulated.</p>
            </CardContent>
          </Card>
          <Separator className="my-3" />
        </div>
      </ScrollArea>
      <SheetFooter className="p-4 border-t mt-auto flex flex-col sm:flex-col space-y-2 sm:space-y-2 sm:justify-start">
        {isAuthenticated && authUserPublicKey && (
          <div className="text-xs text-muted-foreground p-2 border rounded-md bg-background/50 text-center break-all">
            <p className="font-semibold mb-1 flex items-center justify-center gap-1"><Wallet className="h-4 w-4" />
            Authenticated Wallet: {`${authUserPublicKey.substring(0, 4)}...${authUserPublicKey.substring(authUserPublicKey.length - 4)}`} </p>
          </div>
        )}
        <DisconnectButton data-testid="disconnect-button-test" />
      </SheetFooter>
    </>
  );
};

export default PlayerWallet;
