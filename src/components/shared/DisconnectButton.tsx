"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/useAuth";
import { useSessionWallet } from "@/hooks/auth/useSessionWallet";
import { useToast } from "@/hooks/ui/use-toast";
import { logger } from "@/utils/logger";
import { LogOut, PawPrint } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";

interface DisconnectButtonProps extends Omit<ButtonProps, "onClick" | "disabled" | "children"> {
  onDisconnect?: () => void;
  redirectPath?: string;
}

// --- Hooks ---

const useDisconnect = (onDisconnect?: () => void, redirectPath: string = "/") => {
  const { logout: logoutAuthHook } = useAuth();
  const { disconnectFromSession, sessionPublicKey } = useSessionWallet();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (!sessionPublicKey) {
      toast({
        title: "Not Connected",
        description: "No active session to disconnect.",
        variant: "default",
      });
      return;
    }

    setIsDisconnecting(true);
    toast({ title: "Disconnecting...", description: "Ending your session." });

    try {
      logger.log("[DisconnectButton] Logging out from auth hook...");
      await logoutAuthHook();

      logger.log("[DisconnectButton] Auth hook logout complete. Disconnecting wallet session...");
      await disconnectFromSession();

      logger.log("[DisconnectButton] Wallet session disconnect complete.");
      toast({ title: "Disconnected", description: "Session ended successfully.", duration: 3000 });

      if (onDisconnect) onDisconnect();
      if (pathname !== redirectPath) router.push(redirectPath);
      else router.push(redirectPath);
    } catch (error: unknown) {
      logger.error("[DisconnectButton] Error during full disconnect process:", error);
      toast({
        title: "Disconnection Error",
        description: `An error occurred: ${error instanceof Error ? error.message : "Unknown error"}.`,
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  return { handleDisconnect, isDisconnecting, isConnected: !!sessionPublicKey };
};

// --- Sub-components ---

const DisconnectIcon = ({ isDisconnecting }: { isDisconnecting: boolean }) =>
  isDisconnecting ? (
    <PawPrint className="mr-2 rtl:ml-2 h-5 w-5 animate-pulse" />
  ) : (
    <LogOut className="mr-2 rtl:ml-2 h-5 w-5" />
  );

// --- Main Component ---

const DisconnectButton: React.FC<DisconnectButtonProps> = ({
  onDisconnect,
  redirectPath = "/",
  ...buttonProps
}) => {
  const { handleDisconnect, isDisconnecting, isConnected } = useDisconnect(
    onDisconnect,
    redirectPath
  );

  return (
    <Button
      variant="destructive"
      onClick={handleDisconnect}
      disabled={!isConnected || isDisconnecting}
      className="w-full text-base py-3"
      {...buttonProps}
    >
      <DisconnectIcon isDisconnecting={isDisconnecting} />
      {isDisconnecting ? "Disconnecting..." : "Disconnect"}
    </Button>
  );
};

export default DisconnectButton;
