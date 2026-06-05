"use client";

import { TwoFactorManagement } from "@/components/auth/TwoFactorManagement";
import { Fingerprint } from "lucide-react";

export function SecurityBiometrics() {
  return (
    <div className="mt-12 pt-8 border-t">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Fingerprint className="w-6 h-6 text-primary" />
        Administrative Security (2FA)
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your passkeys and authenticator app for secure administrative access. High-security
        actions require 2FA verification.
      </p>
      <div className="bg-card/50 rounded-lg p-6 border">
        <TwoFactorManagement />
      </div>
    </div>
  );
}
