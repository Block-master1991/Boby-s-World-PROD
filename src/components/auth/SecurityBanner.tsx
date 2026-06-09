"use client";

import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/contexts/AuthContext";
import { useSecurityOnboarding } from "@/hooks/security/useSecurityOnboarding";
import { ArrowRight, Shield } from "lucide-react";
import React, { useState } from "react";


const BannerContent: React.FC<{
  onEnable: () => void;
  onRemindLater: () => void;
  onDismissPermanently: () => void;
}> = ({
  onEnable,
  onRemindLater,
  onDismissPermanently,
}) => (
  <div className="bg-amber-500/10 border-b border-amber-500/20 p-3 relative overflow-hidden group">
    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent w-full h-full animate-pulse" />
    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10 px-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-500/20 rounded-full">
          <Shield className="w-4 h-4 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-200">Secure Your Account</p>
          <p className="text-xs text-amber-200/60 hidden sm:block">
            Add an extra layer of security with multi-factor authentication
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-200 hover:text-amber-100 hover:bg-amber-500/20 text-xs"
          onClick={onRemindLater}
        >
          Remind me later
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-200 hover:text-amber-100 hover:bg-amber-500/20 text-xs"
          onClick={onDismissPermanently}
        >
          Don't show again
        </Button>
        <Button
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-8 text-xs px-4"
          onClick={onEnable}
        >
          Set Up Now <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  </div>
);

export const SecurityBanner: React.FC = () => {
  const { isAuthenticated, hasPasskey, isLoading } = useAuthContext();
  const { showModal, handleDismiss, handleRemindLater, handleDismissPermanently } = useSecurityOnboarding();
  const [showBanner, setShowBanner] = useState(true);

  const handleRemindLaterClick = () => {
    handleRemindLater();
    setShowBanner(false);
    handleDismiss();
  };

  const handleDismissPermanentlyClick = () => {
    handleDismissPermanently();
    setShowBanner(false);
    handleDismiss();
  };

  if (isLoading || !isAuthenticated || hasPasskey || !showModal || !showBanner) return null;

  return (
    <>
      <BannerContent 
        onEnable={handleDismiss}
        onRemindLater={handleRemindLaterClick}
        onDismissPermanently={handleDismissPermanentlyClick}
      />
      
    </>
  );
};
