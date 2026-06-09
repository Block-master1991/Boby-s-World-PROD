"use client";

import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/misc/usePWAInstall";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { useToast } from "@/hooks/ui/use-toast";
import { logger } from "@/utils/logger";
import { Download, Smartphone, X } from "lucide-react";
import React, { useState } from "react";

interface PWAInstallButtonProps {
  variant?: "button" | "banner" | "floating";
  showOnlyOnMobile?: boolean;
  autoShow?: boolean;
  className?: string;
}

// --- Hooks ---

const usePWAInstallAction = (autoShow: boolean) => {
  const { isInstallable, isInstalled, promptInstall, dismissPrompt } = usePWAInstall();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [showBanner, setShowBanner] = useState(autoShow);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await promptInstall();
      toast({
        title: "Installing Boby World",
        description: "The app is being installed on your device.",
      });
    } catch (error) {
      logger.error("[PWAInstallButton] Installation failed:", error);
      toast({
        title: "Installation Failed",
        description: "Could not install the app. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    dismissPrompt();
    setShowBanner(false);
    toast({
      title: "Install Later",
      description: "You can install Boby World anytime from your browser menu.",
    });
  };

  return {
    isInstallable,
    isInstalled,
    isMobile,
    showBanner,
    isInstalling,
    handleInstall,
    handleDismiss,
  };
};

// --- Sub-components ---

const InstallBanner = ({
  className,
  isInstalling,
  onInstall,
  onDismiss,
}: {
  className: string;
  isInstalling: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) => (
  <div
    className={`fixed bottom-4 left-4 right-4 z-50 bg-primary text-primary-foreground p-4 rounded-lg shadow-lg border ${className}`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6" />
        <div>
          <h3 className="font-semibold text-sm">Install Boby World</h3>
          <p className="text-xs opacity-90">Play offline and get the best experience</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={onInstall}
          disabled={isInstalling}
          className="text-xs"
        >
          {isInstalling ? "Installing..." : "Install"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="h-8 w-8 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
);

const InstallFloatingButton = ({
  className,
  isInstalling,
  onInstall,
}: {
  className: string;
  isInstalling: boolean;
  onInstall: () => void;
}) => (
  <Button
    onClick={onInstall}
    disabled={isInstalling}
    className={`fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg ${className}`}
    size="icon"
  >
    <Download className="h-6 w-6" />
  </Button>
);

const InstallDefaultButton = ({
  className,
  isInstalling,
  onInstall,
}: {
  className: string;
  isInstalling: boolean;
  onInstall: () => void;
}) => (
  <Button
    onClick={onInstall}
    disabled={isInstalling}
    variant="outline"
    className={`flex items-center gap-2 ${className}`}
  >
    <Download className="h-4 w-4" />
    {isInstalling ? "Installing..." : "Install App"}
  </Button>
);

// --- Main Component ---

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = "button",
  showOnlyOnMobile = true,
  autoShow = false,
  className = "",
}) => {
  const {
    isInstallable,
    isInstalled,
    isMobile,
    showBanner,
    isInstalling,
    handleInstall,
    handleDismiss,
  } = usePWAInstallAction(autoShow);

  // Visibility guard
  if (!isInstallable || isInstalled || (showOnlyOnMobile && !isMobile)) {
    return null;
  }

  if (variant === "banner" && showBanner) {
    return (
      <InstallBanner
        className={className}
        isInstalling={isInstalling}
        onInstall={handleInstall}
        onDismiss={handleDismiss}
      />
    );
  }

  if (variant === "floating") {
    return (
      <InstallFloatingButton
        className={className}
        isInstalling={isInstalling}
        onInstall={handleInstall}
      />
    );
  }

  return (
    <InstallDefaultButton
      className={className}
      isInstalling={isInstalling}
      onInstall={handleInstall}
    />
  );
};
