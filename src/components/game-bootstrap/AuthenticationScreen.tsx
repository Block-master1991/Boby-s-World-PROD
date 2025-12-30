'use client';

import React, { useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Button } from '@/components/ui/button';
import { PawPrint, AlertTriangle, LogOutIcon, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { PWAInstallButton } from '@/components/shared/PWAInstallButton';

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
  const isMobile = useIsMobile();
  const loginAttemptedRef = useRef(false); // New ref to track if login has been attempted

  useEffect(() => {
    // Reset loginAttemptedRef when relevant conditions change
    if (!wallet.connected || !captchaVerified || isAuthenticated) {
      loginAttemptedRef.current = false;
    }

    // DESKTOP ONLY: Attempt automatic login if conditions are met.
    // We skip this on mobile to avoid triggering popup blockers.
    if (
      !isMobile && // ONLY on desktop
      captchaVerified &&
      wallet.connected &&
      !wallet.disconnecting &&
      wallet.publicKey &&
      !isLoadingAuth &&
      (!isAuthenticated || !isWalletConnectedAndMatching) &&
      !loginAttemptedRef.current
    ) {
      console.log("[AuthenticationScreen] Desktop detected. Attempting auto-login.");
      loginAttemptedRef.current = true;
      onLoginAttempt();
    }
  }, [
    isMobile, // Added dependency
    captchaVerified,
    wallet.connected,
    wallet.disconnecting, // Added dependency
    wallet.publicKey, // Added dependency
    isLoadingAuth, // Added dependency
    isAuthenticated,
    isWalletConnectedAndMatching, // Added dependency
    onLoginAttempt // Added dependency
  ]);

  // Display loading screen if authentication is in progress
  if (isLoadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        <div className="relative mb-8">
          <Image src="/Boby-logo.png" alt="Boby World Loading" width={180} height={180} className="rounded-md opacity-80" style={{ width: 'auto', height: 'auto' }} data-ai-hint="dog logo" priority />
        </div>
        <PawPrint className="h-12 w-12 animate-pulse text-primary mb-4" />
        <h1 className="text-4xl font-bold mb-2 font-headline">Boby World</h1>
        <p className="text-xl text-muted-foreground">
          Processing authentication...
        </p>
        <p className="text-sm text-muted-foreground mt-4 text-center max-w-xs">
          {isMobile ? 'Check your wallet app if prompted for approval. Connection may take longer on mobile.' : 'Please wait. If prompted, check your wallet.'}
        </p>
        {isMobile && (
          <Button onClick={onRequestDisconnect} variant="outline" size="sm" className="mt-4">
            <LogOutIcon className="mr-2 h-4 w-4" /> Cancel & Disconnect Wallet
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      <Image src="/Boby-logo.png" alt="Boby World Logo" width={180} height={180} className="mb-8 rounded-md" style={{ width: 'auto', height: 'auto' }} data-ai-hint="dog logo" priority />
      <h1 className="text-4xl font-bold mb-4 font-headline">Welcome to Boby World!</h1>

      {/* State 1: Wallet not connected */}
      {!wallet.connected && (
        <>
          <p className="text-xl text-muted-foreground mb-6 max-w-md">
            Connect your wallet to start your adventure.
          </p>

          {isMobile && (
            <div className="bg-secondary/20 p-4 rounded-lg mb-6 max-w-md">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-5 w-5 text-primary" />
                <span className="font-semibold text-sm">Mobile Wallet Tips</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 text-left">
                <li>• Choose Phantom or Solflare for best experience</li>
                <li>• You'll be redirected to your wallet app</li>
                <li>• Return here after connecting</li>
                <li>• Transactions will open your wallet automatically</li>
              </ul>
            </div>
          )}

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

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('walletName');
                  console.log("Wallet preference cleared from localStorage.");
                  window.location.reload();
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Reset Selection
            </Button>
          </div>
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
              <Button onClick={onLoginAttempt} className="mb-3 w-full max-w-sm" size="lg">
                <ShieldCheck className="mr-2 h-5 w-5" /> Authenticate with Current Wallet
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 mb-8">
              <p className="text-lg text-muted-foreground max-w-md">
                <ShieldCheck className="inline-block mr-2 h-5 w-5" />
                Wallet connected. Please sign in to verify ownership.
              </p>
              <Button onClick={onLoginAttempt} className="w-full max-w-sm animate-pulse hover:animate-none" size="lg">
                <PawPrint className="mr-2 h-5 w-5" /> Sign In with Wallet
              </Button>
              {isMobile && (
                <p className="text-xs text-muted-foreground">
                  This will open your wallet app to sign a message.
                </p>
              )}
            </div>
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
          <p className="text-lg text-muted-foreground mb-6">
            Ready to enter Boby World!
          </p>

          {/* PWA Install Button */}
          <div className="mb-6">
            <PWAInstallButton
              variant="button"
              showOnlyOnMobile={true}
              className="w-full max-w-xs"
            />
          </div>

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
