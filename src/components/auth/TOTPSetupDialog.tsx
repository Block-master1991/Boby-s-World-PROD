"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Loader2, QrCode } from "lucide-react";
import React, { useState } from "react";

interface TOTPSetupDialogProps {
  qrCodeUrl: string;
  onVerify: (token: string) => Promise<void>;
  loading: boolean;
}

export const TOTPSetupDialog: React.FC<TOTPSetupDialogProps> = ({
  qrCodeUrl,
  onVerify,
  loading,
}) => {
  const [token, setToken] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleVerify = async () => {
    await onVerify(token);
    setToken("");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <QrCode className="h-4 w-4" /> Setup Authenticator App
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Setup Authenticator App</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-muted-foreground text-center">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          <div className="bg-white p-2 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
          </div>
          <div className="w-full flex flex-col items-center gap-2">
            <Label htmlFor="token">Verification Code</Label>
            <InputOTP maxLength={6} value={token} onChange={setToken} onComplete={handleVerify}>
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
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleVerify}
            disabled={loading || token.length !== 6}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify & Enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
