"use client";

import { useToast } from "@/hooks/use-toast";
import { fetchWithCsrf } from "@/lib/utils";
import type { AuthState } from "@/types/auth";
import { useCallback } from "react";

interface UseTOTPAuthProps {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
}

export const useTOTPAuth = ({ setAuthState }: Omit<UseTOTPAuthProps, "authState">) => {
  const { toast } = useToast();

  const verifyTOTP = useCallback(
    async (token: string): Promise<boolean> => {
      setAuthState(p => ({ ...p, isLoading: true, error: null }));
      try {
        const res = await fetchWithCsrf("/api/auth/totp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed");

        setAuthState(p => ({
          ...p,
          isAuthenticated: true,
          isLoading: false,
          isLocked: false, // Unlock session
          user: p.user ? { ...p.user, authMethod: data.authMethod } : null,
          authMethod: data.authMethod,
        }));

        toast({ title: "Success", description: "Session unlocked." });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid code";
        setAuthState(p => ({ ...p, isLoading: false, error: message }));
        toast({ variant: "destructive", title: "Verification Failed", description: message });
        return false;
      }
    },
    [setAuthState, toast]
  );

  return { verifyTOTP };
};
