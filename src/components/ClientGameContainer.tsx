"use client";

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect } from 'react';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import { useAuthContext } from '@/contexts/AuthContext';
import { PasskeyOnboardingModal } from '@/components/auth/PasskeyOnboardingModal';
import CaptchaScreen from '@/components/game-bootstrap/CaptchaScreen';
import { RECAPTCHA_SITE_KEY } from '@/lib/constants';
import { useAudio } from '@/contexts/AudioContext';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';

import type { GameContainerProps } from './GameContainer';

// Dynamic imports with better loading strategy
const DynamicGameContainer = dynamic<GameContainerProps>(() => import('./GameContainer'), {
  ssr: false,
  loading: () => <LoadingScreen variant="indeterminate" />,
});

// Separate lazy loading for game modes (future enhancement)
export const loadBobyWorldMode = () => import('./GameContainer');
export const loadRunningGameMode = () => import('./game/RunningGameUI');

export default function ClientGameContainer() {
  const { isAuthenticated, hasPasskey, isLoading } = useAuthContext();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const { setHasUserInteracted, soundManagerRef } = useAudio();
  const { toast } = useToast();

  const siteKey = RECAPTCHA_SITE_KEY;

  // Initialize from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('captcha_verified_session');
      if (stored === 'true') {
        setCaptchaVerified(true);
      }
    } catch (e) {
      logger.warn("Failed to access sessionStorage:", e);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !captchaVerified) {
      setCaptchaVerified(true);
      // Also save to session storage if authenticated
      try {
        sessionStorage.setItem('captcha_verified_session', 'true');
      } catch (e) {
        // ignore
      }
    }
  }, [isAuthenticated, captchaVerified]);

  const handleCaptchaSuccess = () => {
    logger.log("[ClientGameContainer] Captcha verified successfully.");
    setCaptchaVerified(true);
    setHasUserInteracted(true);
    soundManagerRef.current?.playCurrentTrack();
    toast({ title: 'Verification Successful', description: 'You can now connect your wallet.', duration: 3000 });

    // Persist verification for this session
    try {
      sessionStorage.setItem('captcha_verified_session', 'true');
    } catch (e) {
      logger.warn("Failed to save captcha state:", e);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasPasskey) {
      const dismissed = localStorage.getItem('passkey_onboarding_dismissed');
      const now = Date.now();
      // Show if not dismissed or if dismissed more than 3 days ago (less aggressive than 7 days)
      if (!dismissed || (now - parseInt(dismissed)) > 3 * 24 * 60 * 60 * 1000) {
        setShowOnboarding(true);
      }
    }
  }, [isLoading, isAuthenticated, hasPasskey]);

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('passkey_onboarding_dismissed', Date.now().toString());
  };

  // If auth is still checking, show primary loading
  if (isLoading) {
    return <LoadingScreen message="" showLogo variant="indeterminate" />;
  }

  // If not authenticated and captcha not verified, show Captcha ASAP
  if (!isAuthenticated && !captchaVerified) {
    if (!siteKey) {
      return <LoadingScreen message="Preparing verification..." showLogo variant="indeterminate" />;
    }
    return <CaptchaScreen siteKey={siteKey} onVerificationSuccess={handleCaptchaSuccess} />;
  }

  return (
    <Suspense fallback={<LoadingScreen variant="indeterminate" />}>
      <DynamicGameContainer captchaVerified={captchaVerified} />
      <PasskeyOnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
      />
    </Suspense>
  );
}
