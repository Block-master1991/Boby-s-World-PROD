
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReCAPTCHA from "react-google-recaptcha";
import { Button } from '@/components/ui/button'; // Button might still be used if we add a manual retry, but not for primary verification.
import { Loader2, AlertTriangle } from 'lucide-react'; // Lock icon removed as button is removed
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import BobyLogo from '@/app/Boby-logo.png';

interface CaptchaScreenProps {
  siteKey: string;
  onVerificationSuccess: () => void;
}

const CaptchaScreen: React.FC<CaptchaScreenProps> = ({ siteKey, onVerificationSuccess }) => {
  const [isVerifyingCaptcha, setIsVerifyingCaptcha] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const { toast } = useToast();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [captchaTokenForAutoVerify, setCaptchaTokenForAutoVerify] = useState<string | null>(null);

  useEffect(() => {
    const preferredTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setTheme(preferredTheme);

    const observer = new MutationObserver(() => {
        const newTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        if (newTheme !== theme) {
            setTheme(newTheme);
            recaptchaRef.current?.reset();
            setCaptchaTokenForAutoVerify(null); // Reset token on theme change
        }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class']});
    return () => observer.disconnect();
  }, [theme]);

  const verifyToken = useCallback(async (token: string) => {
    if (isVerifyingCaptcha) return; // Prevent multiple simultaneous verifications

    setIsVerifyingCaptcha(true);
    setCaptchaError(null);

    try {
      const response = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      });
      const data = await response.json();
      if (data.success) {
        onVerificationSuccess();
      } else {
        setCaptchaError(data.error || 'CAPTCHA verification failed. Please try again.');
        toast({ title: 'Verification Failed', description: data.error || 'CAPTCHA verification failed. Please try again.', variant: 'destructive', duration: 5000 });
        recaptchaRef.current?.reset();
        setCaptchaTokenForAutoVerify(null);
      }
    } catch (error) {
      console.error("CAPTCHA verification request failed:", error);
      setCaptchaError('An error occurred during verification. Please try again.');
      toast({ title: 'Network Error', description: 'An error occurred while trying to verify the CAPTCHA.', variant: 'destructive', duration: 5000 });
      recaptchaRef.current?.reset();
      setCaptchaTokenForAutoVerify(null);
    } finally {
      setIsVerifyingCaptcha(false);
    }
  }, [onVerificationSuccess, toast, isVerifyingCaptcha]);

  const handleCaptchaChange = useCallback((tokenValue: string | null) => {
    setCaptchaTokenForAutoVerify(tokenValue); // Store the token
    if (tokenValue) {
      setCaptchaError(null);
      // Automatically trigger verification when a new token is received
      verifyToken(tokenValue);
    }
  }, [verifyToken]);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-8 text-center">
      {BobyLogo && <Image src={BobyLogo} alt="Boby's World Logo" width={180} height={180} className="mb-8 rounded-md" data-ai-hint="dog logo" priority />}
      <h1 className="text-4xl font-bold mb-4 font-headline">Verification Required</h1>
      <p className="text-xl text-muted-foreground mb-6 max-w-md">
        Please complete the verification below.
      </p>
      <div className="mb-4 p-4 bg-card rounded-lg shadow-md border border-border">
        <ReCAPTCHA
          key={theme}
          ref={recaptchaRef}
          sitekey={siteKey}
          onChange={handleCaptchaChange}
          theme={theme}
          hl="en" // Set language to English
        />
      </div>
      {isVerifyingCaptcha && (
        <div className="flex items-center text-muted-foreground mt-4">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>Verifying...</span>
        </div>
      )}
      {captchaError && !isVerifyingCaptcha && (
        <p className="text-sm text-destructive mt-4 flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 mr-1" /> {captchaError}
        </p>
      )}
      {/* The "Verify & Proceed" button is removed */}
    </div>
  );
};

export default CaptchaScreen;
