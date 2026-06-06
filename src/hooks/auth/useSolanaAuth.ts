import { useToast } from "@/hooks/use-toast";
import { performanceMonitor } from "@/lib/advanced-service-worker";
import type { AuthState, LoginResponse } from "@/types/auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useRef, type MutableRefObject } from "react";

interface UseSolanaAuthProps {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  logoutAndRedirect: (path?: string) => Promise<void>;
}

interface SignMessageAdapter {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

const isSignMessageAdapter = (adapter: unknown): adapter is SignMessageAdapter => {
  return (
    typeof adapter === "object" &&
    adapter !== null &&
    "signMessage" in adapter &&
    typeof (adapter as SignMessageAdapter).signMessage === "function"
  );
};

const isUserCancel = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("rejected") ||
    message.includes("user rejected") ||
    message.includes("aborted")
  );
};

const signChallenge = async (
  message: Uint8Array,
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined,
  adapter: unknown
): Promise<Uint8Array> => {
  if (adapter && isSignMessageAdapter(adapter)) {
    try {
      return await adapter.signMessage(message);
    } catch (error: unknown) {
      if (isUserCancel(error)) throw error;
    }
  }

  if (!signMessage) {
    throw new Error("Wallet cannot sign authentication challenge.");
  }

  return signMessage(message);
};

const requestLoginNonce = async (publicKey: string): Promise<string> => {
  const nonceRes = await fetch(`/api/auth/login?publicKey=${publicKey}`);
  if (!nonceRes.ok) throw new Error("Failed to get nonce.");
  const { nonce } = await nonceRes.json();
  return nonce;
};

const submitLogin = async (
  publicKey: string,
  signature: Uint8Array,
  nonce: string
): Promise<LoginResponse> => {
  const loginRes = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      publicKey,
      signature: Buffer.from(signature).toString("hex"),
      nonce,
    }),
  });

  const data: LoginResponse = await loginRes.json();
  if (!loginRes.ok) {
    if (loginRes.status === 403) {
      throw new Error("FORBIDDEN");
    }
    throw new Error(data.error || "Login failed.");
  }

  return data;
};

const buildLoginHandler = ({
  publicKey,
  connected,
  signMessage,
  adapter,
  setAuthState,
  logoutAndRedirect,
  toast,
  loginInProgressRef,
}: {
  publicKey: unknown;
  connected: boolean;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined;
  adapter: unknown;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  logoutAndRedirect: (path?: string) => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
  loginInProgressRef: MutableRefObject<boolean>;
}) =>
  async (): Promise<boolean> => {
    if (loginInProgressRef.current) return false;
    loginInProgressRef.current = true;
    try {
      if (!publicKey || !connected) throw new Error("Wallet not connected.");
      setAuthState(p => ({ ...p, isLoading: true, error: null }));

      const startTime = Date.now();
      const nonce = await requestLoginNonce(publicKey.toString());
      const msgBytes = new TextEncoder().encode(`Sign this message to authenticate with Boby World.\nNonce: ${nonce}`);
      const signature = await signChallenge(msgBytes, signMessage, adapter);
      const data = await submitLogin(publicKey.toString(), signature, nonce);

      if (data.success && data.publicKey) {
        performanceMonitor.recordLoadTime(Date.now() - startTime);
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: {
            publicKey: data.publicKey,
            wallet: data.publicKey,
            totpEnabled: !!data.totpEnabled,
            authMethod: data.authMethod || "wallet",
          },
          error: null,
          isLocked: !!data.totpEnabled,
          authMethod: data.authMethod || "wallet",
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
      if (e instanceof Error && e.message === "FORBIDDEN") {
        await logoutAndRedirect("/");
        return false;
      }

      const msg = e instanceof Error ? e.message : "Login failed";
      setAuthState(p => ({ ...p, isLoading: false, error: msg, isAuthenticated: false }));
      toast({ variant: "destructive", title: "Login Error", description: msg });
      return false;
    } finally {
      loginInProgressRef.current = false;
    }
  };

export const useSolanaAuth = ({ setAuthState, logoutAndRedirect }: UseSolanaAuthProps) => {
  const { publicKey, signMessage, connected, wallet } = useWallet();
  const { toast } = useToast();
  const loginInProgressRef = useRef(false);

  const login = useCallback(
    buildLoginHandler({
      publicKey,
      connected,
      signMessage,
      adapter: wallet?.adapter,
      setAuthState,
      logoutAndRedirect,
      toast,
      loginInProgressRef,
    }),
    [publicKey, connected, signMessage, wallet?.adapter, setAuthState, logoutAndRedirect, toast]
  );

  return { login };
};
