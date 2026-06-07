"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle, Key, Smartphone, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";

export const IntroStep: React.FC<{
  description: string;
  setDescription: (val: string) => void;
  onClose: () => void;
  onRegister: () => void;
  onSetupTotp?: () => void;
  isSecurityEnabled?: boolean;
  onRemindLater?: () => void;
  onDismissPermanently?: () => void;
}> = ({ description, setDescription, onClose, onRegister, onSetupTotp, isSecurityEnabled, onRemindLater, onDismissPermanently }) => {
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || "";
      setIsMobileDevice(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
      );
    };
    checkMobile();
  }, []);

  // If security is already enabled, show completion message
  if (isSecurityEnabled) {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="bg-green-500/10 h-20 w-20 rounded-full flex items-center justify-center mx-auto shadow-inner">
          <ShieldCheck className="h-12 w-12 text-green-500" />
        </div>
        <div className="space-y-2">
          <p className="font-bold text-lg">Security Already Enabled</p>
          <p className="text-sm text-muted-foreground">
            Your account is already protected with multi-factor authentication.
          </p>
        </div>
        <Button onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Passkey Option - Mobile Only */}
        {isMobileDevice && (
          <div className="p-4 rounded-2xl border-2 border-primary/20 bg-primary/5 transition-all hover:border-primary/40">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-sm">Passkey Authentication (Recommended)</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Faster, more secure logins using your device's fingerprint or face ID.
                </p>
                <div className="pt-2">
                  <Label
                    htmlFor="device-description"
                    className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
                  >
                    Device Name
                  </Label>
                  <Input
                    id="device-description"
                    placeholder="e.g., My iPhone, Work Laptop"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="h-8 text-xs mt-1 bg-background"
                  />
                </div>
                <Button onClick={onRegister} className="w-full mt-3 h-9 font-bold text-xs gap-2">
                  Set Up Passkey <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TOTP Option - Primary on Desktop */}
        <div className={`p-4 rounded-2xl transition-all ${
          !isMobileDevice 
            ? "border-2 border-primary/20 bg-primary/5 hover:border-primary/40" 
            : "border border-muted bg-muted/20 hover:bg-muted/30"
        }`}>
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-xl ${
              !isMobileDevice ? "bg-primary/10" : "bg-background shadow-sm"
            }`}>
              <Smartphone className={`h-6 w-6 ${
                !isMobileDevice ? "text-primary" : "text-muted-foreground"
              }`} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-sm">
                Authenticator App
                {!isMobileDevice && " (Recommended)"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Use apps like Google Authenticator or Authy to generate codes.
              </p>
              <Button
                variant={isMobileDevice ? "outline" : "default"}
                onClick={onSetupTotp}
                className="w-full mt-3 h-9 font-bold text-xs gap-2"
              >
                Set Up Authenticator <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {onRemindLater && (
          <Button
            variant="ghost"
            onClick={onRemindLater}
            className="flex-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Remind me later
          </Button>
        )}
        {onDismissPermanently && (
          <Button
            variant="ghost"
            onClick={onDismissPermanently}
            className="flex-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Don't show again
          </Button>
        )}
      </div>
    </>
  );
};

export const RegisterStep = () => (
  <div className="text-center py-12">
    <div className="relative mb-6">
      <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 bg-primary/10 mx-auto"></div>
      <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
    </div>
    <p className="font-bold">Registering Passkey...</p>
    <p className="text-xs text-muted-foreground mt-2">Follow the prompts on your device.</p>
  </div>
);

export const SuccessStep: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="text-center py-12">
    <div className="bg-green-500/10 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
      <CheckCircle className="h-10 w-10 text-green-500" />
    </div>
    <p className="text-xl font-black mb-2 tracking-tight">YOU ARE SECURED!</p>
    <p className="text-xs text-muted-foreground mb-8 max-w-[200px] mx-auto font-medium">
      Your account is now protected with high-level biometric authentication.
    </p>
    <Button onClick={onClose} className="w-full font-black tracking-widest h-12">
      CONTINUE
    </Button>
  </div>
);
