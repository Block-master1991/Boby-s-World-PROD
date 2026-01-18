'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useAuthenticationLifecycle } from '@/hooks/useAuthenticationLifecycle';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import React from 'react';
import { AuthenticatedView, GuestView, LoadingView, SignInView, WalletMismatchView } from './AuthViews';

interface AuthenticationScreenProps {
  onRequestDisconnect: () => Promise<void>;
  onLoginAttempt: () => Promise<void>;
  captchaVerified: boolean;
}

const AuthenticationScreen: React.FC<AuthenticationScreenProps> = ({ onRequestDisconnect, onLoginAttempt, captchaVerified }) => {
  const { 
    loginWithPasskey, isLoading: isLoadingAuth, error: authError, isAuthenticated, user, isWalletConnectedAndMatching, hasPasskey 
  } = useAuth();
  
  const { isPWA, wallet } = useAuthenticationLifecycle({ loginWithPasskey, isAuthenticated, captchaVerified });
  const isMobile = useIsMobile();

  if (isLoadingAuth) {
    return <LoadingView isMobile={isMobile} onRequestDisconnect={onRequestDisconnect} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      <Image src="/Boby-logo.png" alt="Boby World Logo" width={180} height={180} className="mb-8 rounded-md" priority />
      <h1 className="text-4xl font-bold mb-4 font-headline">Welcome to Boby World!</h1>
      <input type="text" autoComplete="username webauthn" className="sr-only" aria-hidden="true" tabIndex={-1} />

      {!wallet.connected && (
        <GuestView isMobile={isMobile} isPWA={isPWA} hasPasskey={hasPasskey} isAuthenticated={isAuthenticated} loginWithPasskey={loginWithPasskey} />
      )}

      {wallet.connected && wallet.publicKey && (!isAuthenticated || !isWalletConnectedAndMatching) && (
        isAuthenticated && user && !isWalletConnectedAndMatching ? (
          <WalletMismatchView walletPublicKey={wallet.publicKey} userPublicKey={user.publicKey} onLoginAttempt={onLoginAttempt} onRequestDisconnect={onRequestDisconnect} />
        ) : (
          <SignInView isMobile={isMobile} walletPublicKey={wallet.publicKey} onLoginAttempt={onLoginAttempt} onRequestDisconnect={onRequestDisconnect} />
        )
      )}

      {isAuthenticated && isWalletConnectedAndMatching && user && (
        <AuthenticatedView userPublicKey={user.publicKey} hasPasskey={hasPasskey} />
      )}

      {authError && (
        <div className="mt-8 p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 animate-shake">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-xs font-medium text-destructive">{authError}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground mt-12"><ShieldCheck className="inline h-4 w-4 mr-1" /> Your wallet is your key to the game.</p>
    </div>
  );
};

export default AuthenticationScreen;
