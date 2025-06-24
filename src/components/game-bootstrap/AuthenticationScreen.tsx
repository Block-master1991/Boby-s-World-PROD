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
  const { isLoading: isLoadingAuth, error: authError, isAuthenticated, user, isWalletConnectedAndMatching } = useAuth();
  const wallet = useWallet();

  useEffect(() => {
    // Attempt automatic login if captcha is verified, wallet is connected,
    // and we are not already authenticated with the connected wallet.
    // Also, ensure we are not already in an auth loading state.
    if (
      captchaVerified &&
      wallet.connected &&
      !wallet.disconnecting &&
      wallet.publicKey &&
      !isLoadingAuth &&
      (!isAuthenticated || !isWalletConnectedAndMatching) // If not authenticated OR authenticated but wallet mismatch
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
    isWalletConnectedAndMatching, // Added new dependency
    onLoginAttempt
  ]);
  
  // Display loading screen if authentication is in progress
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

      {/* State 1: Wallet not connected */}
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

      {/* State 2: Wallet connected, but not authenticated OR authenticated with a different wallet */}
      {wallet.connected && wallet.publicKey && (!isAuthenticated || !isWalletConnectedAndMatching) && ( 
        <>
          <p className="text-xl text-muted-foreground mb-6 max-w-md">
            Wallet <span className="font-semibold text-primary">{wallet.publicKey.toBase58().substring(0, 4)}...{wallet.publicKey.toBase58().substring(wallet.publicKey.toBase58().length - 4)}</span> connected.
          </p>
          {isAuthenticated && user && !isWalletConnectedAndMatching ? (
            <>
              <p className="text-lg text-destructive mb-4">
                <AlertTriangle className="inline-block mr-2 h-5 w-5" />
                Authenticated as <span className="font-semibold text-destructive">{user.publicKey.substring(0, 4)}...{user.publicKey.substring(user.publicKey.length - 4)}</span>, but a different wallet is connected.
              </p>
              <p className="text-md text-muted-foreground mb-8">
                Please disconnect the current wallet and connect with your authenticated wallet, or log in with the current wallet.
              </p>
              <Button onClick={onLoginAttempt} className="mb-3">
                <ShieldCheck className="mr-2 h-5 w-5" /> Authenticate with Current Wallet
              </Button>
            </>
          ) : (
            <p className="text-lg text-muted-foreground mb-8">
              <Loader2 className="inline-block mr-2 h-5 w-5 animate-spin" />
              Authenticating... Please check your wallet if prompted.
            </p>
          )}
          <Button onClick={onRequestDisconnect} variant="outline" className="mt-3">
            <LogOutIcon className="mr-2 h-5 w-5" /> Disconnect Wallet
          </Button>
        </>
      )}

      {/* State 3: Authenticated and wallet connected and matching */}
      {isAuthenticated && isWalletConnectedAndMatching && (
        <>
          <p className="text-xl text-muted-foreground mb-6 max-w-md">
            You are logged in as <span className="font-semibold text-primary">{user?.publicKey.substring(0, 4)}...{user?.publicKey.substring(user?.publicKey.length - 4)}</span>.
          </p>
          <p className="text-lg text-muted-foreground mb-8">
            Ready to enter Boby's World!
          </p>
          {/* No explicit button to "enter game" here, as GameContainer handles the transition */}
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
