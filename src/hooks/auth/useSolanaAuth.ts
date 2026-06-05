import { useToast } from "@/hooks/use-toast";
import { performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthState, LoginResponse } from "@/types/auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useRef } from "react";

interface UseSolanaAuthProps {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  logoutAndRedirect: (path?: string) => Promise<void>;
}

export const useSolanaAuth = ({ setAuthState, logoutAndRedirect }: UseSolanaAuthProps) => {
  const { publicKey, signMessage, connected, wallet } = useWallet();
  const { toast } = useToast();
  const loginInProgressRef = useRef(false);

  const login = useCallback(async (): Promise<boolean> => {
    if (loginInProgressRef.current) return false;
    loginInProgressRef.current = true;
    try {
      if (!publicKey || !signMessage || !connected) throw new Error("Wallet not connected.");
      setAuthState(p => ({ ...p, isLoading: true, error: null }));
      const startTime = Date.now();
      const nonceRes = await fetch(`/api/auth/login?publicKey=${publicKey.toString()}`);
      if (!nonceRes.ok) throw new Error("Failed to get nonce.");
      const { nonce } = await nonceRes.json();

      const msgBytes = new TextEncoder().encode(
        `Sign this message to authenticate with Boby World.\nNonce: ${nonce}`
      );
      let signature: Uint8Array;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try {
        signature = await (wallet?.adapter as any).signMessage(msgBytes, {
          display: JSON.stringify({ title: "Boby World", domain: window.location.hostname }),
        });
      } catch {
        signature = await signMessage(msgBytes);
      }

      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          publicKey: publicKey.toString(),
          signature: Buffer.from(signature).toString("hex"),
          nonce,
        }),
      });
      const data: LoginResponse = await loginRes.json();
      if (!loginRes.ok) {
        if (loginRes.status === 403) {
          await logoutAndRedirect("/");
          return false;
        }
        throw new Error(data.error || "Login failed.");
      }
      if (data.success && data.publicKey) {
        performanceMonitor.recordLoadTime(Date.now() - startTime);
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: { publicKey: data.publicKey, wallet: data.publicKey },
          error: null,
          isLocked: false,
        });
        localStorage.setItem("last_user_pk", data.publicKey);
        toast({
          title: "Login Successful",
          description: `Wallet: ${data.publicKey.slice(0, 8)}...`,
        });
        return true;
      }
      throw new Error("Unknown login error.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Login failed";
      setAuthState(p => ({ ...p, isLoading: false, error: msg, isAuthenticated: false }));
      toast({ variant: "destructive", title: "Login Error", description: msg });
      return false;
    } finally {
      loginInProgressRef.current = false;
    }
  }, [publicKey, signMessage, connected, wallet, setAuthState, logoutAndRedirect, toast]);

  return { login };
};
