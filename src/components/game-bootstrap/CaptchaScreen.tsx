"use client";

import { useAudio } from "@/contexts/AudioContext";
import { useToast } from "@/hooks/ui/use-toast";
import { logger } from "@/utils/logger";
import { AlertTriangle, PawPrint } from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";

interface CaptchaScreenProps {
  siteKey: string;
  onVerificationSuccess: () => void;
}

// --- Types ---

type Theme = "light" | "dark";
type ToastFn = ReturnType<typeof useToast>["toast"];

interface GRecaptcha {
  reset: () => void;
}

interface WindowWithRecaptcha extends Window {
  grecaptcha?: GRecaptcha;
}

// --- Hooks ---

const useCaptchaTheme = () => {
  const [theme, setTheme] = useState<Theme>("light");

  const detectTheme = useCallback(
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    []
  );

  useEffect(() => {
    setTheme(detectTheme());
    const obs = new MutationObserver(() => setTheme(detectTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [detectTheme]);

  return { theme, setTheme };
};

const useCaptchaScriptLoader = (
  toast: ToastFn,
  setTheme: React.Dispatch<React.SetStateAction<Theme>>
) => {
  const [isLoading, setIsLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLoad = useCallback(() => {
    logger.log("[CaptchaScreen] CAPTCHA script loaded");
    setIsLoading(false);
    setShowRetry(false);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleError = useCallback(() => {
    logger.warn("[CaptchaScreen] CAPTCHA script failed");
    setAttempts(prev => {
      const next = prev + 1;
      if (next >= 3) {
        setIsLoading(false);
        setShowRetry(true);
        setError("Failed to load verification system. Please refresh.");
        toast({
          title: "Loading Error",
          description: "Failed to load verification system.",
          variant: "destructive",
        });
      } else {
        setTheme(t => (t === "light" ? "dark" : "light"));
      }
      return next;
    });
  }, [toast, setTheme]);

  useEffect(() => {
    if (!isLoading) return;
    if (typeof window !== "undefined" && (window as WindowWithRecaptcha).grecaptcha) {
      handleLoad();
      return;
    }
    loadTimeoutRef.current = setTimeout(() => isLoading && handleError(), 15000);
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, [isLoading, handleLoad, handleError]);

  const retry = useCallback(() => {
    setIsLoading(true);
    setAttempts(0);
    setShowRetry(false);
    setError(null);
    setTheme(t => (t === "light" ? "dark" : "light"));
  }, [setTheme]);

  return { isLoading, attempts, showRetry, error, handleLoad, handleError, retry };
};

const useCaptchaVerification = (onSuccess: () => void, toast: ToastFn) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (token: string, reset: () => void) => {
      if (isVerifying) return;
      setIsVerifying(true);
      setError(null);
      try {
        const res = await fetch("/api/verify-captcha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (data.success) {
          onSuccess();
        } else {
          const msg = data.error || "Verification failed.";
          setError(msg);
          toast({ title: "Verification Failed", description: msg, variant: "destructive" });
          reset();
        }
      } catch (e) {
        logger.error("CAPTCHA error:", e);
        setError("Network error during verification.");
        toast({
          title: "Network Error",
          description: "Verification failed.",
          variant: "destructive",
        });
        reset();
      } finally {
        setIsVerifying(false);
      }
    },
    [onSuccess, toast, isVerifying]
  );

  return { isVerifying, error, verify, setError };
};

// --- Sub-components ---

const CaptchaOverlay: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div
    className="fixed inset-0 flex items-center justify-center bg-white/50 backdrop-blur-md text-black text-5xl font-bold cursor-pointer z-50 text-center"
    onClick={onClick}
  >
    Start Boby World
  </div>
);

const CaptchaHeader = () => (
  <>
    <Image
      src="/Boby-logo.png"
      alt="Boby World Logo"
      width={180}
      height={180}
      className="mb-8 rounded-md"
      priority
    />
    <h1 className="text-4xl font-bold mb-4 font-headline">Verification Required</h1>
    <p className="text-xl text-muted-foreground mb-6 max-w-md">
      Please complete the verification below.
    </p>
  </>
);

interface StatusProps {
  isVerifying: boolean;
  showRetry: boolean;
  loadErr: string | null;
  verifyErr: string | null;
  onRetry: () => void;
}

const CaptchaStatus: React.FC<StatusProps> = ({
  isVerifying,
  showRetry,
  loadErr,
  verifyErr,
  onRetry,
}) => (
  <div className="mt-4 flex flex-col items-center">
    {isVerifying && (
      <div className="flex items-center text-muted-foreground">
        <PawPrint className="mr-2 h-5 w-5 animate-pulse" />
        <span>Verifying...</span>
      </div>
    )}
    {showRetry && (
      <div className="flex flex-col items-center">
        <p className="text-sm text-destructive mb-2 text-center">
          Having trouble loading verification?
        </p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    )}
    {(loadErr || (verifyErr && !isVerifying && !showRetry)) && (
      <p className="text-sm text-destructive flex items-center justify-center">
        <AlertTriangle className="h-4 w-4 mr-1" /> {loadErr || verifyErr}
      </p>
    )}
  </div>
);

// --- Main Component ---

const CaptchaScreen: React.FC<CaptchaScreenProps> = ({ siteKey, onVerificationSuccess }) => {
  const { theme, setTheme } = useCaptchaTheme();
  const { toast } = useToast();
  const {
    isLoading,
    attempts,
    showRetry,
    error: loadErr,
    handleLoad,
    handleError,
    retry,
  } = useCaptchaScriptLoader(toast, setTheme);
  const {
    isVerifying,
    error: verifyErr,
    verify,
    setError: setVerifyErr,
  } = useCaptchaVerification(onVerificationSuccess, toast);
  const [showOverlay, setShowOverlay] = useState(true);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const { soundManagerRef, setHasUserInteracted, setCurrentScreen } = useAudio();

  useEffect(() => setCurrentScreen("captcha"), [setCurrentScreen]);

  const handleOverlayClick = () => {
    setShowOverlay(false);
    setHasUserInteracted(true);
    soundManagerRef.current?.playCurrentTrack();
  };

  return (
    <div className="game-bootstrap-container relative flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {showOverlay && <CaptchaOverlay onClick={handleOverlayClick} />}
      <CaptchaHeader />
      <div className="mb-4 p-4 bg-card rounded-lg shadow-md border border-border relative">
        <ReCAPTCHA
          key={`${theme}-${attempts}`}
          ref={recaptchaRef}
          sitekey={siteKey}
          theme={theme}
          hl="en"
          onChange={t => {
            if (t) {
              setVerifyErr(null);
              verify(t, () => recaptchaRef.current?.reset());
            }
          }}
          asyncScriptOnLoad={handleLoad}
          onErrored={handleError}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-card/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-md">
            <PawPrint className="h-8 w-8 animate-pulse text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading verification system...</p>
            {attempts > 0 && (
              <p className="text-xs text-muted-foreground mt-2">Attempt {attempts}/3</p>
            )}
          </div>
        )}
      </div>
      <CaptchaStatus
        isVerifying={isVerifying}
        showRetry={showRetry}
        loadErr={loadErr}
        verifyErr={verifyErr}
        onRetry={retry}
      />
    </div>
  );
};

export default CaptchaScreen;
