import { useToast } from "@/hooks/use-toast";
import { backgroundSync, cacheManager, performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthState } from "@/types/auth";
import { logger } from "@/utils/logger";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

interface UseLogoutProps {
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  userPublicKey: string | undefined;
}

const performLogoutRequest = async (userPublicKey: string | undefined) => {
  const csrfToken = document.cookie
    .split("; ")
    .find(row => row.startsWith("csrfToken="))
    ?.split("=")[1];
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  await fetch("/api/auth/logout", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ publicKey: userPublicKey }),
  });
};

export const useLogout = ({ setAuthState, userPublicKey }: UseLogoutProps) => {
  const { disconnect } = useWallet();
  const { toast } = useToast();
  const router = useRouter();

  const logout = useCallback(async (): Promise<void> => {
    logger.log(`[Logout] User: ${userPublicKey || "N/A"}`);
    setAuthState(p => ({ ...p, isLoading: true }));

    try {
      if (!navigator.onLine) {
        backgroundSync.addOperation(() => performLogoutRequest(userPublicKey), 10);
        toast({ title: "Offline", description: "Logout queued." });
      } else {
        await performLogoutRequest(userPublicKey);
      }
      toast({ title: "Logged Out", description: "Success." });
    } catch {
      performanceMonitor.recordError();
      toast({
        variant: "destructive",
        title: "Logout Error",
        description: "Server contact failed.",
      });
    } finally {
      // Cleanup Cache & Local Storage
      cacheManager.clearAllCaches().catch(() => {});
      ["offline_coin_queue_v1", "offline_penalty_queue_v1", "last_user_pk"].forEach(k =>
        localStorage.removeItem(k)
      );
      sessionStorage.removeItem("captcha_verified_session");
      sessionStorage.clear();

      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
        isLocked: false,
      });
    }
  }, [userPublicKey, toast, setAuthState]);

  const logoutAndRedirect = useCallback(
    async (path = "/") => {
      await logout();
      try {
        await disconnect();
      } catch {
        /* noop */
      }
      router.push(path);
    },
    [logout, disconnect, router]
  );

  return { logout, logoutAndRedirect };
};
