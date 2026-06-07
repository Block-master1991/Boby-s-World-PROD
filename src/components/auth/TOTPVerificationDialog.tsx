"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Shield } from "lucide-react";
import React, { useState } from "react";

interface TOTPVerificationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (token: string) => Promise<void>;
  loading: boolean;
}

const OTPInputSection = ({
  token,
  setToken,
  onComplete,
}: {
  token: string;
  setToken: (v: string) => void;
  onComplete: () => void;
}) => {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, "").slice(0, 6);
      if (!digits) return;
      setToken(digits);
    } catch {
      // Ignore clipboard errors and keep the user in control.
    }
  };

  return (
    <div className="space-y-3">
      <Label htmlFor="token" className="sr-only">
        Verification Code
      </Label>
      <InputOTP maxLength={6} value={token} onChange={setToken} onComplete={onComplete}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={handlePaste}
        className="w-full"
      >
        Paste from clipboard
      </Button>
    </div>
  );
};

const BackupInputSection = ({
  token,
  setToken,
}: {
  token: string;
  setToken: (v: string) => void;
}) => (
  <div className="w-full space-y-2">
    <Label htmlFor="backup">Backup Code</Label>
    <Input
      id="backup"
      placeholder="8-character code"
      value={token}
      onChange={e => setToken(e.target.value.toUpperCase())}
      maxLength={8}
      className="text-center font-mono tracking-widest"
    />
  </div>
);

export const TOTPVerificationDialog: React.FC<TOTPVerificationDialogProps> = ({
  isOpen,
  onOpenChange,
  onVerify,
  loading,
}) => {
  const [token, setToken] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleVerify = async () => {
    await onVerify(token);
    setToken("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {useBackupCode ? (
              <KeyRound className="h-5 w-5 text-primary" />
            ) : (
              <Shield className="h-5 w-5 text-primary" />
            )}
            {useBackupCode ? "Backup Code" : "Two-Factor Authentication"}
          </DialogTitle>
          <DialogDescription>
            {useBackupCode
              ? "Enter one of your 8-character backup codes."
              : "Enter the 6-digit code from your authenticator app."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-full flex justify-center py-2">
            {useBackupCode ? (
              <BackupInputSection token={token} setToken={setToken} />
            ) : (
              <OTPInputSection token={token} setToken={setToken} onComplete={handleVerify} />
            )}
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setUseBackupCode(!useBackupCode);
              setToken("");
            }}
            className="text-xs"
          >
            {useBackupCode ? "Use authenticator app instead" : "Lost access? Use a backup code"}
          </Button>
        </div>
        <DialogFooter>
          <Button
            onClick={handleVerify}
            disabled={loading || (useBackupCode ? token.length !== 8 : token.length !== 6)}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
