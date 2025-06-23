'use client';

import React, { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, LogOutIcon, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import BobyLogo from '@/app/Boby-logo.png';
import { useAuth } from '@/hooks/useAuth';

interface AuthenticationScreenProps {
  onRequestDisconnect: () => Promise<void>;
  onLoginAttempt: () => Promise<void>;
  captchaVerified: boolean;
}

const AuthenticationScreen: React.FC<AuthenticationScreenProps> = ({ 
    onRequestDisconnect, 
    onLoginAttempt,
    captchaVerified
}) => {
  const { isLoading: isLoadingAuth, error: authError, isAuthenticated } = useAuth();
  const wallet = useWallet();

  useEffect(() => {
    // لا تحاول تسجيل الدخول إلا إذا تم التحقق من الكابتشا
    if (
      captchaVerified &&
      wallet.connected &&
      !wallet.disconnecting &&
      wallet.publicKey &&
      !isLoadingAuth &&
      !isAuthenticated
    ) {
      console.log("[AuthenticationScreen] Wallet connected, captcha verified, and conditions met for automatic login attempt.");
      onLoginAttempt();
    }
  }, [
    captchaVerified,
    wallet.connected,
    wallet.disconnecting,
    wallet.publicKey,
    isLoadingAuth,
    isAuthenticated,
    onLoginAttempt
  ]);
  
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        {BobyLogo && <Image src={BobyLogo} alt="Boby's World Loading" width={180} height={180} className="mb-8 rounded-md" data-ai-hint="dog logo" priority />}
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <h1 className="text-4xl font-bold mb-2 font-headline">Boby's World</h1>
        <p className="text-xl text-muted-foreground">
          Processing authentication...
        </p>
        <p className="text-sm text-muted-foreground mt-2">Please wait. If prompted, check your wallet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {BobyLogo && <Image src={BobyLogo} alt="Boby's World Logo" width={180} height={180} className="mb-8 rounded-md" data-ai-hint="dog logo" priority />}
      <h1 className="text-4xl font-bold mb-4 font-headline">Welcome to Boby's World!</h1>

      {!wallet.connected && (
        <>
          <p className="text-xl text-muted-foreground mb-10 max-w-md">
            Connect your wallet to start your adventure.
          </p>
          <WalletMultiButton
            style={{
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              fontSize: '1.1rem',
              padding: '1rem 2rem',
              borderRadius: '0.5rem',
              height: 'auto',
              lineHeight: 'normal'
            }}
          />
        </>
      )}

      {wallet.connected && wallet.publicKey && !isAuthenticated && ( 
        <>
          <p className="text-xl text-muted-foreground mb-6 max-w-md">
            Wallet <span className="font-semibold text-primary">{wallet.publicKey.toBase58().substring(0, 4)}...{wallet.publicKey.toBase58().substring(wallet.publicKey.toBase58().length - 4)}</span> connected.
          </p>
          <p className="text-lg text-muted-foreground mb-8">
            <Loader2 className="inline-block mr-2 h-5 w-5 animate-spin" />
            Authenticating... Please check your wallet if prompted.
          </p>
          <Button onClick={onRequestDisconnect} variant="outline" className="mt-3">
            <LogOutIcon className="mr-2 h-5 w-5" /> Disconnect Wallet
          </Button>
        </>
      )}

      {authError && (
        <p className="text-sm text-destructive mt-4 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 mr-1" /> {authError}
        </p>
      )}
      <p className="text-sm text-muted-foreground mt-12">
        <ShieldCheck className="inline h-4 w-4 mr-1" /> Your wallet is your key to the game.
      </p>
    </div>
  );
};

export default AuthenticationScreen;