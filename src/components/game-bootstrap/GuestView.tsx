import { Button } from "@/components/ui/button";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Fingerprint, RefreshCw, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import React from "react";

interface CommonProps {
  isMobile: boolean;
}

const QuickLaunchCard: React.FC<{ loginWithPasskey: () => void }> = ({ loginWithPasskey }) => (
  <div className="p-6 bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-3xl backdrop-blur-sm shadow-xl shadow-primary/5">
    <div className="flex items-center gap-4 text-left">
      <div className="bg-primary/20 p-3 rounded-2xl shadow-inner">
        <Fingerprint className="w-6 h-6 text-primary animate-pulse" />
      </div>
      <div className="flex-1">
        <h3 className="text-sm font-bold tracking-tight">Quick Launch</h3>
        <p className="text-[11px] text-muted-foreground leading-tight">
          App installed. Enter Boby World instantly using biometrics.
        </p>
      </div>
      <Button
        onClick={() => loginWithPasskey()}
        className="rounded-full px-6 bg-primary text-primary-foreground hover:scale-105 transition-transform shadow-lg shadow-primary/20 text-xs font-bold"
      >
        SIGN IN
      </Button>
    </div>
  </div>
);

const ConnectWalletSection: React.FC<{ hasPasskey: boolean; loginWithPasskey: () => void }> = ({
  hasPasskey,
  loginWithPasskey,
}) => (
  <div className="flex flex-col items-center gap-4">
    <div className="w-full flex justify-center">
      <WalletMultiButton
        style={{
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          fontSize: "1rem",
          fontWeight: "600",
          padding: "0.75rem 2rem",
          borderRadius: "0.75rem",
          height: "auto",
          width: "100%",
          maxWidth: "280px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          transition: "all 0.2s ease-in-out",
          boxShadow: "0 4px 15px -1px rgba(var(--primary), 0.3)",
        }}
      />
    </div>

    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-[280px]">
      {hasPasskey && (
        <Button
          variant="secondary"
          className="w-full bg-slate-800 hover:bg-slate-700 text-white border-slate-700"
          onClick={() => loginWithPasskey()}
        >
          <ShieldCheck className="h-4 w-4 mr-2 text-green-400" />
          Biometric Login
        </Button>
      )}
      <Button
        variant="ghost"
        className="w-full text-muted-foreground hover:text-foreground text-xs"
        onClick={() => {
          if (typeof window !== "undefined") {
            localStorage.removeItem("walletName");
            window.location.reload();
          }
        }}
      >
        <RefreshCw className="h-3 w-3 mr-2" />
        Reset Wallet
      </Button>
    </div>
  </div>
);

const MobileTips: React.FC = () => (
  <div className="bg-secondary/10 p-4 rounded-2xl border border-secondary/20 text-left">
    <div className="flex items-center gap-2 mb-2">
      <Smartphone className="h-4 w-4 text-primary" />
      <span className="font-bold text-xs uppercase tracking-tight">Mobile Tips</span>
    </div>
    <ul className="text-[10px] text-muted-foreground space-y-1">
      <li>• Use Phantom or Solflare for the smoothest experience.</li>
      <li>• You'll be redirected to your wallet app to sign.</li>
      <li>• Return to this tab once the signature is complete.</li>
    </ul>
  </div>
);

interface GuestViewProps extends CommonProps {
  isPWA: boolean;
  hasPasskey: boolean;
  isAuthenticated: boolean;
  loginWithPasskey: () => void;
}

export const GuestView: React.FC<GuestViewProps> = ({
  isMobile,
  isPWA,
  hasPasskey,
  isAuthenticated,
  loginWithPasskey,
}) => (
  <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-1000 space-y-8">
    {isPWA && hasPasskey && !isAuthenticated && (
      <QuickLaunchCard loginWithPasskey={loginWithPasskey} />
    )}

    <div className="space-y-4">
      <div className="flex items-center justify-center gap-2 text-primary/60">
        <Wallet className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-widest">Connect Wallet</span>
      </div>
      <p className="text-xl text-muted-foreground max-w-sm mx-auto">
        Your journey begins here. Connect to unlock the world.
      </p>
    </div>

    <ConnectWalletSection hasPasskey={hasPasskey} loginWithPasskey={loginWithPasskey} />
    {isMobile && <MobileTips />}
  </div>
);
