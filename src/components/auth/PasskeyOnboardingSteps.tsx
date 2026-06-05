"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle, Key, Smartphone } from "lucide-react";
import React from "react";

export const IntroStep: React.FC<{
  description: string;
  setDescription: (val: string) => void;
  onClose: () => void;
  onRegister: () => void;
  onSetupTotp?: () => void;
}> = ({ description, setDescription, onClose, onRegister, onSetupTotp }) => (
  <>
    <div className="space-y-4">
      {/* Passkey Option */}
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

      {/* TOTP Option */}
      <div className="p-4 rounded-2xl border border-muted bg-muted/20 transition-all hover:bg-muted/30">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-background rounded-xl shadow-sm">
            <Smartphone className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm">Authenticator App</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use apps like Google Authenticator or Authy to generate codes.
            </p>
            <Button
              variant="outline"
              onClick={onSetupTotp}
              className="w-full mt-3 h-9 font-bold text-xs gap-2"
            >
              Set Up Authenticator <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Button
      variant="ghost"
      onClick={onClose}
      className="w-full text-xs text-muted-foreground hover:text-foreground mt-2"
    >
      Maybe Later
    </Button>
  </>
);

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
