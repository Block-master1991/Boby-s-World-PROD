"use client";

import { performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthContextType } from "@/types/auth";
import type { ReactNode } from "react";
import React, { createContext, useContext } from "react";

import { useAuthCore } from "@/hooks/auth/useAuthCore";
import { useLogout } from "@/hooks/auth/useLogout";
import { usePasskeyAuth } from "@/hooks/auth/usePasskeyAuth";
import { useSolanaAuth } from "@/hooks/auth/useSolanaAuth";
import { useTOTPAuth } from "@/hooks/auth/useTOTPAuth";

// Global Guard
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__initialAuthCheckStarted = false;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    authState,
    setAuthState,
    checkSession,
    isWalletConnectedAndMatching,
    retrySessionCheck,
    isOnline,
    markTOTPEnabled,
  } = useAuthCore();
  const { logout, logoutAndRedirect } = useLogout({
    setAuthState,
    userPublicKey: authState.user?.publicKey,
  });
  const { login } = useSolanaAuth({ authState, setAuthState, logoutAndRedirect });
  const { registerPasskey, loginWithPasskey, hasPasskey } = usePasskeyAuth({
    authState,
    setAuthState,
  });
  const { verifyTOTP } = useTOTPAuth({ setAuthState });

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    checkSession,
    isWalletConnectedAndMatching,
    logoutAndRedirect,
    retrySessionCheck,
    triggerSessionRefresh: checkSession,
    markTOTPEnabled,
    registerPasskey,
    loginWithPasskey,
    verifyTOTP,
    hasPasskey,
    totpEnabled: !!authState.user?.totpEnabled,
    securityLevel:
      hasPasskey || !!authState.user?.totpEnabled
        ? "Maximum"
        : authState.isAuthenticated
          ? "Enhanced"
          : "Standard",
    isOnline,
    performanceStats: performanceMonitor.getPerformanceStats(),
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuthContext must be used within an AuthProvider");
  return context;
};
