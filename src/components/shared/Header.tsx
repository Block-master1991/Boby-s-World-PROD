"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/useAuth";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CheckCircle2, Dog, Globe, Shield, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";

// --- Types & Interfaces ---

interface SecurityBadgeProps {
  level: string;
}

interface ConnectivityIndicatorProps {
  isOnline: boolean;
}

// --- Hooks ---

const useHeaderLogic = () => {
  const [isClient, setIsClient] = useState(false);
  const { isAuthenticated, isLoading, login, logout, user, securityLevel, isOnline, retryAfter, rateLimitUntil } = useAuth();
  const { connected } = useWallet();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleAuthAction = async () => {
    if (isAuthenticated) {
      await logout();
    } else {
      await login();
    }
  };

  return {
    isClient,
    isAuthenticated,
    isLoading,
    user,
    securityLevel,
    isOnline,
    connected,
    handleAuthAction,
    retryAfter,
    rateLimitUntil,
  };
};

// --- Sub-components ---

const SecurityBadge: React.FC<SecurityBadgeProps> = ({ level }) => {
  const colors: Record<string, string> = {
    Standard: "bg-zinc-500/20 text-zinc-100 border-zinc-500/30",
    Enhanced: "bg-blue-500/20 text-blue-200 border-blue-500/30",
    Maximum: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  };

  const icon =
    level === "Maximum" ? (
      <Zap size={12} />
    ) : level === "Enhanced" ? (
      <Shield size={12} />
    ) : (
      <CheckCircle2 size={12} />
    );

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${colors[level] || colors["Standard"]}`}
    >
      {icon}
      {level} Protection
    </div>
  );
};

const ConnectivityIndicator: React.FC<ConnectivityIndicatorProps> = ({ isOnline }) => (
  <div
    className={`flex items-center gap-1.5 text-[10px] font-medium ${isOnline ? "text-green-400" : "text-amber-400"}`}
  >
    <Globe size={12} className={isOnline ? "" : "animate-pulse"} />
    {isOnline ? "Online" : "Offline Mode"}
  </div>
);

const LogoSection = ({
  isClient,
  securityLevel,
  isOnline,
}: {
  isClient: boolean;
  securityLevel: string;
  isOnline: boolean;
}) => (
  <div className="flex items-center gap-2">
    <Dog className="h-8 w-8" />
    <h1 className="text-2xl font-headline font-bold">Boby World</h1>
    {isClient && (
      <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-primary-foreground/20">
        <SecurityBadge level={securityLevel} />
        <ConnectivityIndicator isOnline={isOnline} />
      </div>
    )}
  </div>
);

const WalletPlaceholder = () => (
  <Button
    className="wallet-adapter-button-trigger"
    style={{
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--accent-foreground))",
    }}
    disabled
    aria-label="Loading wallet button"
  >
    Select Wallet
  </Button>
);

const AuthActions = ({
  isClient,
  handleAuthAction,
  isLoading,
  isAuthenticated,
  connected,
  user,
  retryAfter,
  rateLimitUntil,
}: ReturnType<typeof useHeaderLogic>) => (
  <div className="flex items-center gap-4">
    {isClient && (
      <Button
        onClick={handleAuthAction}
        disabled={isLoading || (connected && isAuthenticated && !user) || !!(rateLimitUntil && Date.now() < rateLimitUntil)}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {isLoading
          ? ""
          : isAuthenticated
            ? "Logout"
            : rateLimitUntil && Date.now() < rateLimitUntil
              ? `Wait ${retryAfter ?? 0}s`
              : "Login"}
      </Button>
    )}
    {isClient ? (
      <WalletMultiButton
        style={{ backgroundColor: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}
      />
    ) : (
      <WalletPlaceholder />
    )}
  </div>
);

// --- Main Component ---

const Header: React.FC = () => {
  const logic = useHeaderLogic();

  return (
    <header className="bg-primary text-primary-foreground p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <LogoSection
          isClient={logic.isClient}
          securityLevel={logic.securityLevel}
          isOnline={logic.isOnline}
        />
        <AuthActions {...logic} />
      </div>
    </header>
  );
};

export default Header;
