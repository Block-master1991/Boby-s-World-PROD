"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTOTPManagement } from "@/hooks/auth/useTOTPManagement";
import { usePasskeyManagement } from "@/hooks/passkey/usePasskeyManagement";
import type { Passkey } from "@/hooks/passkey/usePasskeyState";
import {
  CheckCircle2,
  Download,
  Key,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { PasskeyRegistrationDialog } from "./PasskeyRegistrationDialog";
import { TOTPSetupDialog } from "./TOTPSetupDialog";

// --- Sub-components ---

const PasskeySection = ({
  pkManagement,
}: {
  pkManagement: ReturnType<typeof usePasskeyManagement>;
}) => {
  const {
    passkeys,
    loading,
    registering,
    deleting,
    description,
    setDescription,
    isDialogOpen,
    setIsDialogOpen,
    registerNewPasskey,
    deletePasskey,
  } = pkManagement;
  return (
    <Card className="border-none shadow-sm bg-muted/20">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-primary" /> Passkeys
            </CardTitle>
            <CardDescription className="text-xs">
              Secure your account using biometrics or hardware keys.
            </CardDescription>
          </div>
          <PasskeyRegistrationDialog
            isOpen={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            description={description}
            setDescription={setDescription}
            onRegister={registerNewPasskey}
            registering={registering}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
            </div>
          ) : passkeys.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-xl bg-background/50">
              <Key className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {passkeys.map((pk: Passkey) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between p-3 border rounded-xl bg-background shadow-sm transition-all hover:border-primary/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Smartphone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{pk.description}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        Added {new Date(pk.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10"
                    onClick={() => deletePasskey(pk.id)}
                    disabled={deleting === pk.id || passkeys.length <= 1}
                  >
                    {deleting === pk.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const BackupCodesSection = ({
  totpManagement,
}: {
  totpManagement: ReturnType<typeof useTOTPManagement>;
}) => {
  const { backupCodes, generateNewBackupCodes, loading } = totpManagement;
  if (backupCodes.length === 0) return null;

  const downloadCodes = () => {
    const text = `Boby's World - Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${backupCodes.join("\n")}\n\nKeep these codes safe!`;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bobys-world-backup-codes.txt";
    a.click();
  };

  return (
    <div className="mt-8 pt-6 border-t border-dashed">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-0.5">
          <h4 className="text-sm font-bold flex items-center gap-2 text-amber-600">
            <KeyRound className="h-4 w-4" /> Backup Codes
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Used if you lose access to your authenticator app.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={downloadCodes}>
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={generateNewBackupCodes}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {backupCodes.map((code, i) => (
          <div
            key={i}
            className="p-2 border border-amber-500/10 rounded-lg bg-amber-500/5 text-center font-mono text-[11px] font-bold tracking-widest text-amber-700 shadow-inner"
          >
            {code}
          </div>
        ))}
      </div>
    </div>
  );
};

const TOTPSection = ({
  totpManagement,
}: {
  totpManagement: ReturnType<typeof useTOTPManagement>;
}) => {
  const { loading, setupData, isTOTPEnabled, initiateSetup, enableTOTP, disableTOTP } =
    totpManagement;
  return (
    <Card className="border-none shadow-sm bg-muted/20">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" /> Authenticator App
              </CardTitle>
              {isTOTPEnabled && (
                <Badge
                  variant="outline"
                  className="bg-green-500/10 text-green-500 border-green-500/20 px-1.5 py-0 text-[10px]"
                >
                  <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> ACTIVE
                </Badge>
              )}
            </div>
            <CardDescription className="text-xs">
              Use apps like Google Authenticator or Authy.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isTOTPEnabled ? (
          <div className="p-3 border rounded-xl bg-background shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-semibold">Active</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Standard TOTP verification
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={disableTOTP}
              disabled={loading}
              className="h-8 text-[11px] font-bold text-destructive hover:bg-destructive/5 border-destructive/20"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : "DISABLE"}
            </Button>
          </div>
        ) : (
          <div className="py-4 flex flex-col items-center">
            {setupData ? (
              <TOTPSetupDialog
                qrCodeUrl={setupData.qrCodeUrl}
                secret={setupData.secret}
                onVerify={enableTOTP}
                loading={loading}
              />
            ) : (
              <Button
                onClick={initiateSetup}
                disabled={loading}
                className="w-full sm:w-auto font-bold gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Smartphone className="h-4 w-4" /> Setup Authenticator
                  </>
                )}
              </Button>
            )}
          </div>
        )}
        <BackupCodesSection totpManagement={totpManagement} />
      </CardContent>
    </Card>
  );
};

export const TwoFactorManagement: React.FC = () => {
  const pkManagement = usePasskeyManagement();
  const totpManagement = useTOTPManagement();
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  useEffect(() => {
    setIsMobileDevice(
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  }, []);
  if (!pkManagement.isAuthenticated) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-1">
      <div className="flex items-center gap-3 px-2 mb-2">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-black tracking-tight">SECURITY SETTINGS</h3>
          <p className="text-xs text-muted-foreground font-medium">
            Protect your account with multi-factor authentication.
          </p>
        </div>
      </div>

      <Separator className="bg-primary/5" />

      <div className="grid gap-6 max-h-[70vh] overflow-y-auto pr-2">
        {isMobileDevice && <PasskeySection pkManagement={pkManagement} />}
        <TOTPSection totpManagement={totpManagement} />
      </div>

      <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
        <Shield className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-blue-600/80 font-medium leading-relaxed">
          {isMobileDevice
            ? "MOBILE SECURITY POLICY: You are highly encouraged to enable both Passkey and Authenticator. We will prompt for both when performing sensitive actions."
            : "DESKTOP SECURITY POLICY: Passkeys are not supported on desktop. Please use an Authenticator App to secure your account."}
        </p>
      </div>
    </div>
  );
};
