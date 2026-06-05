import { useAudio } from "@/contexts/AudioContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import { usePasskeyAutofill } from "./usePasskeyAutofill";

interface UseAuthenticationLifecycleProps {
  loginWithPasskey: (credential: PublicKeyCredential) => void;
  isAuthenticated: boolean;
  captchaVerified: boolean;
}

export const useAuthenticationLifecycle = ({
  loginWithPasskey,
  isAuthenticated,
  captchaVerified,
}: UseAuthenticationLifecycleProps) => {
  const { setCurrentScreen } = useAudio();
  const wallet = useWallet();
  const [isPWA, setIsPWA] = useState(false);
  const loginAttemptedRef = useRef(false);

  // Initialize PWA detection
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsPWA(window.matchMedia("(display-mode: standalone)").matches);
    }
  }, []);

  // Update Audio Context
  useEffect(() => {
    setCurrentScreen("authentication");
  }, [setCurrentScreen]);

  // Handle Passkey Autofill
  usePasskeyAutofill({ loginWithPasskey });

  // Reset login attempt state
  useEffect(() => {
    if (!wallet.connected || !captchaVerified || isAuthenticated) {
      loginAttemptedRef.current = false;
    }
  }, [wallet.connected, captchaVerified, isAuthenticated]);

  return { isPWA, wallet };
};
