import { PWAInstallButton } from "@/components/shared/PWAInstallButton";
import { Button } from "@/components/ui/button";
import type { PublicKey } from "@solana/web3.js";
import {
  AlertTriangle,
  Fingerprint,
  LogOutIcon,
  PawPrint,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import Image from "next/image";
import React from "react";

export { GuestView } from "./GuestView";

interface CommonProps {
  isMobile: boolean;
}

// --- Main Views ---

export const LoadingView: React.FC<CommonProps & { onRequestDisconnect: () => Promise<void> }> = ({
  isMobile,
  onRequestDisconnect,
}) => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
    <div className="relative mb-8">
      <Image
        src="/Boby-logo.png"
        alt="Boby World Loading"
        width={180}
        height={180}
        className="rounded-md opacity-80"
        priority
      />
    </div>
    <PawPrint className="h-12 w-12 animate-pulse text-primary mb-4" />
    <h1 className="text-4xl font-bold mb-2 font-headline">Boby World</h1>
    <p className="text-xl text-muted-foreground">Processing authentication...</p>
    <p className="text-sm text-muted-foreground mt-4 text-center max-w-xs">
      {isMobile
        ? "Check your wallet app if prompted for approval. Connection may take longer on mobile."
        : "Please wait. If prompted, check your wallet."}
    </p>
    {isMobile && (
      <Button onClick={onRequestDisconnect} variant="outline" size="sm" className="mt-4">
        <LogOutIcon className="mr-2 h-4 w-4" /> Cancel & Disconnect Wallet
      </Button>
    )}
  </div>
);

interface ConnectedMismatchProps {
  walletPublicKey: PublicKey;
  userPublicKey: string;
  onLoginAttempt: () => Promise<void>;
  onRequestDisconnect: () => Promise<void>;
}

export const WalletMismatchView: React.FC<ConnectedMismatchProps> = ({
  walletPublicKey,
  userPublicKey,
  onLoginAttempt,
  onRequestDisconnect,
}) => (
  <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
    <p className="text-xl text-muted-foreground max-w-md mx-auto">
      Wallet{" "}
      <span className="font-semibold text-primary">
        {walletPublicKey.toBase58().substring(0, 4)}...
        {walletPublicKey.toBase58().substring(walletPublicKey.toBase58().length - 4)}
      </span>{" "}
      connected.
    </p>
    <div className="space-y-4">
      <p className="text-lg text-destructive">
        <AlertTriangle className="inline-block mr-2 h-5 w-5" />
        Authenticated as{" "}
        <span className="font-semibold text-destructive">
          {userPublicKey.substring(0, 4)}...{userPublicKey.substring(userPublicKey.length - 4)}
        </span>
        , but a different wallet is connected.
      </p>
      <p className="text-md text-muted-foreground">
        Please disconnect the current wallet and connect with your authenticated wallet, or log in
        with the current wallet.
      </p>
      <Button onClick={onLoginAttempt} className="w-full max-w-sm" size="lg">
        <ShieldCheck className="mr-2 h-5 w-5" /> Authenticate with Current Wallet
      </Button>
    </div>
    <Button onClick={onRequestDisconnect} variant="ghost" className="text-muted-foreground">
      <LogOutIcon className="mr-2 h-4 w-4" /> Disconnect Wallet
    </Button>
  </div>
);

interface SignInViewProps extends CommonProps {
  walletPublicKey: PublicKey;
  onLoginAttempt: () => Promise<void>;
  onRequestDisconnect: () => Promise<void>;
}

import { useRouter } from "next/navigation";

// ... (previous imports)

// ... (other components)

export const SignInView: React.FC<SignInViewProps> = ({
  isMobile,
  walletPublicKey,
  onLoginAttempt,
  onRequestDisconnect,
}) => {
  const router = useRouter();

  return (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
      <p className="text-xl text-muted-foreground max-w-md mx-auto">
        Wallet{" "}
        <span className="font-semibold text-primary">
          {walletPublicKey.toBase58().substring(0, 4)}...
          {walletPublicKey.toBase58().substring(walletPublicKey.toBase58().length - 4)}
        </span>{" "}
        connected.
      </p>
      <div className="flex flex-col items-center gap-4">
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          <ShieldCheck className="inline-block mr-2 h-5 w-5 text-primary" />
          Wallet connected. Please sign in to verify ownership.
        </p>
        <Button
          onClick={onLoginAttempt}
          className="w-full max-w-sm animate-pulse hover:animate-none shadow-lg shadow-primary/20"
          size="lg"
        >
          <PawPrint className="mr-2 h-5 w-5" /> Sign In with Wallet
        </Button>
        {isMobile && (
          <p className="text-xs text-muted-foreground">
            This will open your wallet app to sign a message.
          </p>
        )}
      </div>

      <div className="text-center mt-4">
        <button
          onClick={() => router.push("/auth/recovery")}
          className="text-xs text-muted-foreground hover:text-primary underline"
        >
          Having trouble signing in?
        </button>
      </div>

      <Button onClick={onRequestDisconnect} variant="ghost" className="text-muted-foreground">
        <LogOutIcon className="mr-2 h-4 w-4" /> Disconnect Wallet
      </Button>
    </div>
  );
};

interface AuthenticatedViewProps {
  userPublicKey: string;
  hasPasskey: boolean;
}

export const AuthenticatedView: React.FC<AuthenticatedViewProps> = ({
  userPublicKey,
  hasPasskey,
}) => (
  <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-6">
    <p className="text-xl text-muted-foreground max-w-md mx-auto">
      You are logged in as{" "}
      <span className="font-semibold text-primary">
        {userPublicKey.substring(0, 4)}...{userPublicKey.substring(userPublicKey.length - 4)}
      </span>
      .
    </p>
    <div className="flex flex-col items-center gap-6">
      <p className="text-lg text-muted-foreground">Ready to enter Boby World!</p>

      <div className="w-full flex justify-center">
        <PWAInstallButton variant="button" showOnlyOnMobile={true} className="w-full max-w-xs" />
      </div>

      {!hasPasskey && (
        <div className="p-5 bg-primary/5 rounded-3xl border border-primary/10 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-2 mb-2 text-primary font-bold text-xs uppercase tracking-tighter justify-center">
            <Zap size={14} className="fill-primary text-primary" />
            Security Upgrade Available
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Register this device as a <b>Passkey</b> in the Game Menu to enable{" "}
            <b>Biometric Login</b>. This skips wallet signatures and protects your account with
            Maximum-grade security.
          </p>
        </div>
      )}
    </div>
  </div>
);

import { TOTPVerificationDialog } from "@/components/auth/TOTPVerificationDialog";

interface LockedViewProps {
  loginWithPasskey: () => Promise<boolean>;
  verifyTOTP: (token: string) => Promise<boolean>;
  totpEnabled: boolean;
  hasPasskey: boolean;
  isLoading?: boolean;
}

export const LockedView: React.FC<LockedViewProps> = ({
  loginWithPasskey,
  verifyTOTP,
  totpEnabled,
  hasPasskey,
  isLoading,
}) => {
  const [isTOTPDialogOpen, setIsTOTPDialogOpen] = React.useState(false);

  return (
    <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-8 py-10">
      <div className="relative mx-auto w-24 h-24 mb-6">
        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-25" />
        <div className="relative bg-background border-2 border-primary/30 rounded-full w-full h-full flex items-center justify-center shadow-2xl">
          {hasPasskey ? (
            <Fingerprint className="w-12 h-12 text-primary" />
          ) : (
            <ShieldCheck className="w-12 h-12 text-primary" />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-bold tracking-tight">Session Locked</h2>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto">
          Your session is active but protected. Use{" "}
          {hasPasskey ? "biometrics" : "verification code"} to unlock and continue playing.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        {hasPasskey && (
          <Button
            onClick={() => loginWithPasskey()}
            size="lg"
            disabled={isLoading}
            className="w-full max-w-sm rounded-2xl px-10 bg-primary text-primary-foreground hover:scale-105 transition-transform shadow-xl shadow-primary/20 font-bold"
          >
            {isLoading ? (
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-5 w-5" />
            )}
            UNLOCK WITH BIOMETRICS
          </Button>
        )}

        {totpEnabled && (
          <Button
            variant={hasPasskey ? "outline" : "default"}
            onClick={() => setIsTOTPDialogOpen(true)}
            size="lg"
            disabled={isLoading}
            className={`w-full max-w-sm rounded-2xl px-10 font-bold ${!hasPasskey ? "bg-primary text-primary-foreground hover:scale-105 transition-transform shadow-xl shadow-primary/20" : ""}`}
          >
            <Smartphone className="mr-2 h-5 w-5" />
            {hasPasskey ? "USE VERIFICATION CODE" : "UNLOCK WITH CODE"}
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Zap size={10} className="fill-primary text-primary" />
          Maximum-Grade Security Active
        </p>
      </div>

      <TOTPVerificationDialog
        isOpen={isTOTPDialogOpen}
        onOpenChange={setIsTOTPDialogOpen}
        onVerify={async token => {
          const success = await verifyTOTP(token);
          if (success) setIsTOTPDialogOpen(false);
        }}
        loading={!!isLoading}
      />
    </div>
  );
};
