'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReCAPTCHA from "react-google-recaptcha";
import { PawPrint, AlertTriangle } from 'lucide-react'; // Lock icon removed as button is removed
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import Image from 'next/image';
import { useAudio } from '@/contexts/AudioContext';

interface CaptchaScreenProps {
  siteKey: string;
  onVerificationSuccess: () => void;
}

const CaptchaScreen: React.FC<CaptchaScreenProps> = ({ siteKey, onVerificationSuccess }) => {
  const [isVerifyingCaptcha, setIsVerifyingCaptcha] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [isCaptchaLoading, setIsCaptchaLoading] = useState(true); // Loading state for CAPTCHA script
  const [loadAttempts, setLoadAttempts] = useState(0);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [captchaTokenForAutoVerify, setCaptchaTokenForAutoVerify] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true); // New state for the overlay
  const { soundManagerRef, setHasUserInteracted, setCurrentScreen } = useAudio(); // Destructure from useAudio

  const detectTheme = () =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  // Initialize audio screen on mount
  useEffect(() => {
    setCurrentScreen('captcha');
  }, [setCurrentScreen]);

  useEffect(() => {
    const preferredTheme = detectTheme();
    setTheme(preferredTheme);

    const observer = new MutationObserver(() => {
      const newTheme = detectTheme();
      if (newTheme !== theme) {
        setTheme(newTheme);
        recaptchaRef.current?.reset();
        setCaptchaTokenForAutoVerify(null); // Reset token on theme change
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [theme]);

  const handleCaptchaLoad = useCallback(() => {
    logger.log('[CaptchaScreen] CAPTCHA script loaded successfully');
    setIsCaptchaLoading(false);
    setShowRetryButton(false);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleCaptchaError = useCallback(() => {
    logger.warn('[CaptchaScreen] CAPTCHA script failed to load');
    setLoadAttempts(prev => {
      const newAttempts = prev + 1;
      if (newAttempts >= 3) { // maxRetries = 3
        setIsCaptchaLoading(false);
        setShowRetryButton(true);
        setCaptchaError('Failed to load verification system. Please refresh the page.');
        toast({
          title: 'Loading Error',
          description: 'Verification system failed to load. Try refreshing the page.',
          variant: 'destructive',
          duration: 7000
        });
      } else {
        logger.log(`[CaptchaScreen] Retrying CAPTCHA load (attempt ${newAttempts}/3)`);
        // Force re-render by changing key
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
      }
      return newAttempts;
    });
  }, [toast]);

  // Handle CAPTCHA script loading with timeout and retry
  useEffect(() => {
    // If already loaded or not in loading state, no need to check
    if (!isCaptchaLoading) return;

    const maxLoadTime = 15000; // 15 seconds timeout

    // Check if CAPTCHA is already loaded (it might be in the window already)
    if (typeof window !== 'undefined' && (window as any).grecaptcha) {
      logger.log('[CaptchaScreen] grecaptcha found on window');
      handleCaptchaLoad();
      return;
    }

    // Set timeout for CAPTCHA loading if not already loaded
    loadTimeoutRef.current = setTimeout(() => {
      if (isCaptchaLoading) {
        logger.warn('[CaptchaScreen] CAPTCHA loading timeout');
        handleCaptchaError();
      }
    }, maxLoadTime);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [isCaptchaLoading, handleCaptchaLoad, handleCaptchaError]);

  const handleRetryCaptcha = useCallback(() => {
    logger.log('[CaptchaScreen] Manual retry requested');
    setIsCaptchaLoading(true);
    setLoadAttempts(0);
    setShowRetryButton(false);
    setCaptchaError(null);
    // Force re-render by changing key
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);


  const verifyToken = useCallback(async (token: string) => {
    if (isVerifyingCaptcha) return; // Prevent multiple simultaneous verifications

    setIsVerifyingCaptcha(true);
    setCaptchaError(null);

    try {
      const response = await fetch('/api/verify-captcha', { // Use original fetch
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: token }),
      });
      const data = await response.json();
      if (data.success) {
        setCaptchaTokenForAutoVerify(null);
        onVerificationSuccess();
      } else {
        setCaptchaError(data.error || 'CAPTCHA verification failed. Please try again.');
        toast({ title: 'Verification Failed', description: data.error || 'CAPTCHA verification failed. Please try again.', variant: 'destructive', duration: 5000 });
        recaptchaRef.current?.reset();
        setCaptchaTokenForAutoVerify(null);
      }
    } catch (error) {
      logger.error("CAPTCHA verification request failed:", error);
      setCaptchaError('An error occurred during verification. Please try again.');
      toast({ title: 'Network Error', description: 'An error occurred while trying to verify the CAPTCHA.', variant: 'destructive', duration: 5000 });
      recaptchaRef.current?.reset();
      setCaptchaTokenForAutoVerify(null);
    } finally {
      setIsVerifyingCaptcha(false);
    }
  }, [onVerificationSuccess, toast, isVerifyingCaptcha]);

  const handleCaptchaChange = useCallback((tokenValue: string | null) => {
    if (tokenValue && tokenValue !== captchaTokenForAutoVerify) {
      setCaptchaTokenForAutoVerify(tokenValue);
      setCaptchaError(null);
      verifyToken(tokenValue);
    }
  }, [verifyToken, captchaTokenForAutoVerify]);

  const handleOverlayClick = useCallback(() => {
    setShowOverlay(false);
    setHasUserInteracted(true); // Signal user interaction for audio
    soundManagerRef.current?.playCurrentTrack(); // Attempt to play audio
  }, [setHasUserInteracted, soundManagerRef]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {showOverlay && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-white/50 backdrop-blur-md text-black text-5xl font-bold cursor-pointer z-50 text-center"
          onClick={handleOverlayClick}
        >
          Start Boby World
        </div>
      )}
      <Image src="/Boby-logo.png" alt="Boby World Logo" width={180} height={180} className="mb-8 rounded-md" style={{ width: 'auto', height: 'auto' }} data-ai-hint="dog logo" priority />
      <h1 className="text-4xl font-bold mb-4 font-headline">Verification Required</h1>
      <p className="text-xl text-muted-foreground mb-6 max-w-md">
        Please complete the verification below.
      </p>
      <div className="mb-4 p-4 bg-card rounded-lg shadow-md border border-border relative">
        <ReCAPTCHA
          key={`${theme}-${loadAttempts}`} // Force re-render on retry
          ref={recaptchaRef}
          sitekey={siteKey}
          onChange={handleCaptchaChange}
          asyncScriptOnLoad={handleCaptchaLoad}
          onErrored={handleCaptchaError}
          theme={theme}
          hl="en" // Set language to English
        />
        {isCaptchaLoading && (
          <div className="absolute inset-0 bg-card/90 backdrop-blur-sm flex flex-col items-center justify-center rounded-md">
            <PawPrint className="h-8 w-8 animate-pulse text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              Loading verification system...
            </p>
            {loadAttempts > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Attempt {loadAttempts}/3
              </p>
            )}
          </div>
        )}
      </div>
      {isVerifyingCaptcha && (
        <div className="flex items-center text-muted-foreground mt-4">
          <PawPrint className="mr-2 h-5 w-5 animate-pulse" />
          <span>Verifying...</span>
        </div>
      )}
      {showRetryButton && (
        <div className="flex flex-col items-center mt-4">
          <p className="text-sm text-destructive mb-2 text-center">
            Having trouble loading verification?
          </p>
          <button
            onClick={handleRetryCaptcha}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      )}
      {captchaError && !isVerifyingCaptcha && !showRetryButton && (
        <p className="text-sm text-destructive mt-4 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 mr-1" /> {captchaError}
        </p>
      )}
      {/* The "Verify & Proceed" button is removed */}
    </div>
  );
};

export default CaptchaScreen;
