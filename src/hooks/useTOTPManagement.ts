"use client";

import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { useEffect, useState } from "react";

const handleApiError = (error: unknown, title: string) => {
  const message = error instanceof Error ? error.message : "Unknown error occurred";
  toast({ title, description: message, variant: "destructive" });
};

const fetchTotp = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...options });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};

// eslint-disable-next-line max-lines-per-function
export const useTOTPManagement = () => {
  const { isAuthenticated, totpEnabled, triggerSessionRefresh, markTOTPEnabled } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [isTOTPEnabled, setIsTOTPEnabled] = useState(totpEnabled);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Sync local state with auth context (e.g. when session check completes)
  useEffect(() => {
    setIsTOTPEnabled(totpEnabled);
  }, [totpEnabled]);

  const wrap = async (fn: () => Promise<void>, errTitle: string) => {
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      handleApiError(e, errTitle);
    } finally {
      setLoading(false);
    }
  };

  const initiateSetup = () =>
    wrap(async () => {
      const data = await fetchTotp("/api/auth/totp/setup");
      setSetupData(data);
    }, "Setup Error");

  const enableTOTP = (token: string) =>
    wrap(async () => {
      logger.log("[useTOTPManagement] Starting enableTOTP...");
      if (!setupData) return;
      await fetchTotp("/api/auth/totp/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, secret: setupData.secret }),
      });
      logger.log("[useTOTPManagement] fetchTotp /api/auth/totp/enable succeeded.");
      toast({ title: "Success", description: "TOTP enabled." });
      setIsTOTPEnabled(true);
      setSetupData(null);

      // Directly patch auth state — avoids cache race condition where
      // triggerSessionRefresh could return stale data before new cookies are applied,
      // causing isLocked=true and an unwanted page reload / wallet sign screen.
      logger.log("[useTOTPManagement] Calling markTOTPEnabled() to update auth state directly.");
      markTOTPEnabled();

      // Refresh auth session state from the server after enabling TOTP,
      // so the new TTL/authMethod is synchronized and reload preserves the linked state.
      if (triggerSessionRefresh) {
        await triggerSessionRefresh();
      }

      logger.log("[useTOTPManagement] Fetching backup codes...");
      const bcData = await fetchTotp("/api/auth/totp/backup-codes", { method: "POST" });
      logger.log("[useTOTPManagement] Backup codes fetched successfully.");
      if (bcData.codes) setBackupCodes(bcData.codes);
    }, "Enable Error");

  const generateNewBackupCodes = () =>
    wrap(async () => {
      const data = await fetchTotp("/api/auth/totp/backup-codes", { method: "POST" });
      setBackupCodes(data.codes);
      toast({ title: "Success", description: "Codes generated." });
    }, "Backup Codes Error");

  const disableTOTP = () =>
    wrap(async () => {
      await fetchTotp("/api/auth/totp/disable", { method: "POST" });
      toast({ title: "Success", description: "TOTP disabled." });
      setIsTOTPEnabled(false);
      setBackupCodes([]);

      // Ensure global auth state is updated
      if (triggerSessionRefresh) {
        await triggerSessionRefresh();
      }
    }, "Disable Error");

  return {
    loading,
    setupData,
    isTOTPEnabled,
    backupCodes,
    initiateSetup,
    enableTOTP,
    disableTOTP,
    generateNewBackupCodes,
    isAuthenticated,
  };
};
