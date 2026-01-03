
'use client';

import React from 'react';
import type { PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Trophy, Info, AlertCircle, Shield, Fingerprint, Activity, Settings } from 'lucide-react';
import DogMovement from '@/components/game/DogMovement';
import { useAuth } from '@/hooks/useAuth';
import { PasskeyManagement } from '@/components/auth/PasskeyManagement';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface GameMenuSheetContentProps {
  isWalletMismatch: boolean;
  isAuthenticated: boolean; // New prop
  authUserPublicKey: string | undefined; // New prop
  sessionPublicKey: PublicKey | null;
  adapterPublicKey: PublicKey | null;
}

const GameMenuSheetContent: React.FC<GameMenuSheetContentProps> = ({
  isWalletMismatch,
  isAuthenticated,
  sessionPublicKey,
  adapterPublicKey,
}) => {
  const context = useAuth();
  return (
    <>
      <SheetHeader className="p-4 pb-2 border-b">
        <SheetTitle className="text-2xl font-headline">Game Menu</SheetTitle>
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
          <Button variant="ghost" className="w-full justify-start text-base py-3" disabled={isWalletMismatch}><Users className="mr-2 rtl:ml-2 h-5 w-5" /> Friends</Button>
          <Button variant="ghost" className="w-full justify-start text-base py-3" disabled={isWalletMismatch}><Trophy className="mr-2 rtl:ml-2 h-5 w-5" /> Achievements</Button>

          {isAuthenticated && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
                <Shield size={16} /> Security & Privacy
              </h3>
              <div className="space-y-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-sm"
                    >
                      <Fingerprint className="mr-2 h-4 w-4" />
                      Manage Biometrics
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-0">
                      <DialogTitle>Passkey Management</DialogTitle>
                    </DialogHeader>
                    <div className="p-6 pt-2">
                      <PasskeyManagement />
                    </div>
                  </DialogContent>
                </Dialog>

                <div className="p-2 bg-secondary/30 rounded-md text-[10px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Activity size={10} className={context.securityLevel === 'Maximum' ? 'text-amber-500' : 'text-green-500'} />
                    <span>{context.securityLevel} Protection Active</span>
                  </div>
                  <span className="text-green-600 font-bold uppercase tracking-wider">{context.isOnline ? 'Verified' : 'Offline'}</span>
                </div>

                {context.performanceStats && (
                  <div className="px-2 py-1 text-[9px] text-muted-foreground/50 flex justify-between italic">
                    <span>Latency: {context.performanceStats.averageLoadTime || 'N/A'}</span>
                    <span>Optimized: {context.performanceStats.cacheHitRate || '0%'}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DogMovement />
        </div>
      </ScrollArea>
      <SheetFooter className="p-4 border-t mt-auto flex flex-col sm:flex-col space-y-2 sm:space-y-2 sm:justify-start">
      </SheetFooter>
    </>
  );
};

export default GameMenuSheetContent;
