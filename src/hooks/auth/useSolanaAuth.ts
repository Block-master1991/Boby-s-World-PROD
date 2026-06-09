import { useToast } from "@/hooks/ui/use-toast";
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

class RateLimitError extends Error {
  status: number;
  retryAfter: number;
  rateLimitUntil: number;

  constructor(message: string, status: number, retryAfter: number, rateLimitUntil: number) {
    super(message);
    this.name = "RateLimitError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.rateLimitUntil = rateLimitUntil;
  }
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
  if (!nonceRes.ok) {
    if (nonceRes.status === 429) {
      let data: Partial<LoginResponse> = {};
      try {
        data = await nonceRes.json() as Partial<LoginResponse>;
      } catch {
        // Ignore JSON parsing errors
      }
      const retryAfterHeader = nonceRes.headers.get("Retry-After");
      const retryAfter = data.retryAfter ?? (retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60);
      const rateLimitUntil = data.rateLimitUntil ?? (Date.now() + retryAfter * 1000);
      throw new RateLimitError(
        data.error || "Too many login attempts. Please try again later.",
        429,
        retryAfter,
        rateLimitUntil
      );
    }
    throw new Error("Failed to get nonce.");
  }
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
    if (loginRes.status === 429) {
      throw new RateLimitError(
        data.error || "Too many login attempts. Please try again later.",
        429,
        data.retryAfter ?? 60,
        data.rateLimitUntil ?? (Date.now() + (data.retryAfter ?? 60) * 1000)
      );
    }
    throw new Error(data.error || "Login failed.");
  }

  return data;
};

const handleLoginSuccess = (
  startTime: number,
  data: LoginResponse,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
  toast: ReturnType<typeof useToast>["toast"]
) => {
  performanceMonitor.recordLoadTime(Date.now() - startTime);
  setAuthState({
    isAuthenticated: true,
    isLoading: false,
    user: {
      publicKey: data.publicKey!,
      wallet: data.publicKey!,
      totpEnabled: !!data.totpEnabled,
      authMethod: data.authMethod || "wallet",
    },
    error: null,
    isLocked: !!data.totpEnabled,
    authMethod: data.authMethod || "wallet",
    rateLimitUntil: null,
    retryAfter: null,
  });
  localStorage.setItem("last_user_pk", data.publicKey!);
  toast({
    title: "Login Successful",
    description: `Wallet: ${data.publicKey!.slice(0, 8)}...`,
  });
};

const handleLoginFailure = async (
  error: unknown,
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>,
  logoutAndRedirect: (path?: string) => Promise<void>,
  toast: ReturnType<typeof useToast>["toast"]
): Promise<boolean> => {
  if (error instanceof Error && error.message === "FORBIDDEN") {
    await logoutAndRedirect("/");
    return false;
  }

  if (error instanceof RateLimitError) {
    const { retryAfter, rateLimitUntil } = error;
    const msg = error.message;
    setAuthState(p => ({
      ...p,
      isLoading: false,
      error: msg,
      isAuthenticated: false,
      rateLimitUntil,
      retryAfter,
    }));
    toast({ variant: "destructive", title: "Rate Limited", description: msg });
    return false;
  }

  const msg = error instanceof Error ? error.message : "Login failed";
  setAuthState(p => ({ ...p, isLoading: false, error: msg, isAuthenticated: false }));
  toast({ variant: "destructive", title: "Login Error", description: msg });
  return false;
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
  authState,
}: {
  publicKey: unknown;
  connected: boolean;
  signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined;
  adapter: unknown;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  logoutAndRedirect: (path?: string) => Promise<void>;
  toast: ReturnType<typeof useToast>["toast"];
  loginInProgressRef: MutableRefObject<boolean>;
  authState: AuthState;
}) =>
  async (): Promise<boolean> => {
    if (loginInProgressRef.current) return false;

    // Client-side rate-limit block before any network request
    if (authState.rateLimitUntil && Date.now() < authState.rateLimitUntil) {
      const remaining = Math.ceil((authState.rateLimitUntil - Date.now()) / 1000);
      toast({
        variant: "destructive",
        title: "Rate Limited",
        description: `Too many login attempts. Please wait ${remaining} seconds.`,
      });
      return false;
    }

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
        handleLoginSuccess(startTime, data, setAuthState, toast);
        return true;
      }

      throw new Error("Unknown login error.");
    } catch (e: unknown) {
      return handleLoginFailure(e, setAuthState, logoutAndRedirect, toast);
    } finally {
      loginInProgressRef.current = false;
    }
  };

export const useSolanaAuth = ({ authState, setAuthState, logoutAndRedirect }: UseSolanaAuthProps) => {
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
      authState,
    }),
    [publicKey, connected, signMessage, wallet?.adapter, setAuthState, logoutAndRedirect, toast, authState]
  );

  return { login };
};
