import { safeBufferFromBase64url } from '@/utils/base64';
import { logger } from '@/utils/logger';
import WebAuthnTransactionManager from '@/utils/webauthn-transaction';
import { useEffect } from 'react';

interface PasskeyAutofillProps {
  loginWithPasskey: (credential: PublicKeyCredential) => void;
}

// Extend Window interface locally to avoid 'any'
interface ExtendedPublicKeyCredential extends PublicKeyCredential {
  isConditionalMediationAvailable?: () => Promise<boolean>;
}

interface WebAuthnError extends Error {
  name: string;
  message: string;
}

const triggerConditionalUI = async (loginWithPasskey: (c: PublicKeyCredential) => void) => {
  let transactionStarted = false;
  try {
    if (WebAuthnTransactionManager.isActive()) return;

    logger.log("[WebAuthn] Conditional UI is available. Preparing autofill...");

    const challengeResponse = await fetch('/api/auth/webauthn/authenticate');
    if (!challengeResponse.ok) return;
    const options = await challengeResponse.json();

    if (WebAuthnTransactionManager.isActive()) return;

    const signal = WebAuthnTransactionManager.start();
    transactionStarted = true;

    // Cast options to generic object to satisfy TS for this specific browser API
    const credential = await navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: safeBufferFromBase64url(options.challenge),
      },
      mediation: 'conditional',
      signal: signal
    } as CredentialCreationOptions) as PublicKeyCredential;

    if (credential) {
      logger.log("[WebAuthn] Autofill credential selected!");
      loginWithPasskey(credential);
    }
  } catch (error) {
    const err = error as WebAuthnError;
    if (err.name !== 'AbortError' && err.message !== 'A WebAuthn request is already pending.') {
      logger.error("[WebAuthn] Conditional UI Error:", err);
    }
  } finally {
    if (transactionStarted) {
      WebAuthnTransactionManager.complete();
    }
  }
};

export const usePasskeyAutofill = ({ loginWithPasskey }: PasskeyAutofillProps) => {
  useEffect(() => {
    const setup = async () => {
      const pkCred = window.PublicKeyCredential as unknown as ExtendedPublicKeyCredential;
      const isAvailable = await pkCred?.isConditionalMediationAvailable?.();
      
      if (typeof window !== 'undefined' && window.PublicKeyCredential && isAvailable) {
        await triggerConditionalUI(loginWithPasskey);
      }
    };

    setup();
  }, [loginWithPasskey]);
};
