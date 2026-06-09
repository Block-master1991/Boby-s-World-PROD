import { useToast } from "@/hooks/ui/use-toast";
import { fetchWithCsrf } from "@/lib/utils";
import type { AuthState, WebAuthnRegisterOptions } from "@/types/auth";
import { safeBufferFromBase64url, uint8ArrayToBase64url } from "@/utils/base64";
import { logger } from "@/utils/logger";
import WebAuthnTransactionManager from "@/utils/webauthn-transaction";
import { useCallback, useEffect, useState } from "react";

interface UsePasskeyAuthProps {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
}

const initiateRegistration = async (publicKey: string) => {
  WebAuthnTransactionManager.start();
  const res = await fetchWithCsrf("/api/auth/webauthn/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: publicKey, userName: `User ${publicKey.slice(0, 4)}` }),
  });
  if (!res.ok) throw new Error("Init failed");
  return res.json() as Promise<WebAuthnRegisterOptions>;
};

const createCredential = (opts: WebAuthnRegisterOptions) => {
  const challenge = Uint8Array.from(safeBufferFromBase64url(opts.challenge));
  const userId = Uint8Array.from(safeBufferFromBase64url(opts.user.id));

  const publicKeyOpts: PublicKeyCredentialCreationOptions = {
    ...(opts as unknown as PublicKeyCredentialCreationOptions),
    challenge,
    user: { ...opts.user, id: userId },
  };

  return navigator.credentials.create({
    publicKey: publicKeyOpts,
  }) as Promise<PublicKeyCredential | null>;
};

const confirmRegistration = async (
  userId: string,
  description: string,
  cred: PublicKeyCredential
) => {
  const response = cred.response as AuthenticatorAttestationResponse;
  const transport = response.getTransports ? response.getTransports() : [];

  const pubKey = response.getPublicKey ? response.getPublicKey() : null;
  const body = {
    userId,
    description,
    credential: {
      id: cred.id,
      publicKey: pubKey ? uint8ArrayToBase64url(new Uint8Array(pubKey)) : "",
    },
    transports: transport,
  };
  const conf = await fetchWithCsrf("/api/auth/webauthn/register/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!conf.ok) throw new Error("Confirm failed");
  return true;
};

const getAssertion = async (uid: string) => {
  const signal = WebAuthnTransactionManager.start();
  const res = await fetchWithCsrf("/api/auth/webauthn/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: uid }),
  });

  const opts = await res.json();
  if (!res.ok) {
    throw new Error(opts.error || "Failed to initiate authentication");
  }

  const challengeBuf = Uint8Array.from(safeBufferFromBase64url(opts.challenge));

  // Crucial fix: Map allowCredentials to convert base64url IDs to Uint8Arrays
  const allowCredentials = opts.allowCredentials?.map((cred: PublicKeyCredentialDescriptor) => ({
    ...cred,
    id: Uint8Array.from(safeBufferFromBase64url(cred.id as unknown as string)),
  }));

  const assertion = (await navigator.credentials.get({
    publicKey: { ...opts, challenge: challengeBuf, allowCredentials },
    signal,
  })) as PublicKeyCredential;

  return { assertion, discoveryId: opts.discoveryId };
};

const verifyPasskeyAssertion = async (
  uid: string,
  assertion: PublicKeyCredential,
  discoveryId?: string
) => {
  const { id, response } = assertion;
  const assertionResponse = response as AuthenticatorAssertionResponse;
  const credentialResponse = {
    id,
    discoveryId,
    response: {
      authenticatorData: uint8ArrayToBase64url(new Uint8Array(assertionResponse.authenticatorData)),
      clientDataJSON: uint8ArrayToBase64url(new Uint8Array(assertionResponse.clientDataJSON)),
      signature: uint8ArrayToBase64url(new Uint8Array(assertionResponse.signature)),
      userHandle: assertionResponse.userHandle
        ? uint8ArrayToBase64url(new Uint8Array(assertionResponse.userHandle))
        : null,
    },
  };
  const res = await fetchWithCsrf("/api/auth/webauthn/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: uid || undefined, credentialResponse }),
  });
  if (!res.ok) throw new Error("Verification failed");
  return res.json();
};

export const usePasskeyAuth = ({ authState, setAuthState }: UsePasskeyAuthProps) => {
  const { toast } = useToast();
  const [hasPasskey, setHasPasskey] = useState(false);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "PublicKeyCredential" in window &&
      localStorage.getItem("boby_world_passkey_registered") === "true"
    )
      setHasPasskey(true);
  }, []);
  const registerPasskey = useCallback(
    async (description = "My Device"): Promise<boolean> => {
      if (!authState.isAuthenticated || !authState.user?.publicKey) {
        toast({ variant: "destructive", title: "Error", description: "Log in first." });
        return false;
      }
      if (WebAuthnTransactionManager.isActive()) WebAuthnTransactionManager.cancel();
      let started = false;
      try {
        started = true;
        const cred = await createCredential(await initiateRegistration(authState.user.publicKey));
        if (!cred) throw new Error("Cancelled");
        await confirmRegistration(authState.user.publicKey, description, cred);
        localStorage.setItem("boby_world_passkey_registered", "true");
        setHasPasskey(true);
        toast({ title: "Success", description: "Passkey registered." });
        return true;
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : "Failed";
        logger.error("Passkey Reg Error:", m);
        toast({ variant: "destructive", title: "Error", description: m });
        return false;
      } finally {
        if (started) WebAuthnTransactionManager.complete();
      }
    },
    [authState, toast]
  );
  const loginWithPasskey = useCallback(
    async (pre?: unknown): Promise<boolean> => {
      // If a transaction is active (e.g., Autofill/Conditional UI), cancel it
      // to allow this manual click-to-login request to proceed.
      if (WebAuthnTransactionManager.isActive()) {
        logger.log("[WebAuthn] Cancelling pending transaction to start manual login.");
        WebAuthnTransactionManager.cancel();
      }
      setAuthState(p => ({ ...p, isLoading: true, error: null }));
      let started = false;
      try {
        const uid = localStorage.getItem("last_user_pk") || "";
        // Ensure 'pre' is a valid credential and not a MouseEvent/Event from onClick
        let assertion = pre && typeof pre === "object" && "response" in pre ? pre : undefined;
        let discoveryId: string | undefined;
        if (!assertion) {
          started = true;
          const { assertion: a, discoveryId: d } = await getAssertion(uid);
          assertion = a;
          discoveryId = d;
        }
        if (!assertion) throw new Error("No credential");
        const data = await verifyPasskeyAssertion(
          uid,
          assertion as PublicKeyCredential,
          discoveryId
        );
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: { publicKey: data.publicKey, wallet: data.publicKey },
          error: null,
          isLocked: false, // Unlock session
        });
        return true;
      } catch (e: unknown) {
        setAuthState(p => ({ ...p, isLoading: false, error: (e as Error).message }));
        return false;
      } finally {
        if (started) WebAuthnTransactionManager.complete();
      }
    },
    [setAuthState]
  );
  return { registerPasskey, loginWithPasskey, hasPasskey };
};
