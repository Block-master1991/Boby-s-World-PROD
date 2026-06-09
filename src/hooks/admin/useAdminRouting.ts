"use client";

import { useAuth } from "@/hooks/auth/useAuth";
import { ADMIN_WALLET_ADDRESS } from "@/lib/constants";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function useAdminRouting() {
  const { isAuthenticated, isLoading: isAuthHookLoading, user, logout: logoutAuthHook } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isAuthHookLoading) return;

    // Redirect if not authenticated or not admin
    if (!isAuthenticated || user?.publicKey !== ADMIN_WALLET_ADDRESS) {
      if (pathname === "/admin") {
        router.replace("/");
      }
    }
  }, [isAuthenticated, isAuthHookLoading, user, pathname, router]);

  return {
    isAuthenticated,
    isAuthHookLoading,
    user,
    logoutAuthHook,
    isAdmin: user?.publicKey === ADMIN_WALLET_ADDRESS,
  };
}
