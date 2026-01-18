"use client";

import { PasskeyOnboardingModal } from '@/components/auth/PasskeyOnboardingModal';
import CaptchaScreen from '@/components/game-bootstrap/CaptchaScreen';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import { useAudio } from '@/contexts/AudioContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RECAPTCHA_SITE_KEY } from '@/lib/constants';
import { logger } from '@/utils/logger';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useState } from 'react';

import type { GameContainerProps } from './GameContainer';

// Dynamic imports with better loading strategy
const DynamicGameContainer = dynamic<GameContainerProps>(() => import('./GameContainer'), {
  ssr: false,
  loading: () => <LoadingScreen variant="indeterminate" />,
});

// Separate lazy loading for game modes (future enhancement)
export const loadBobyWorldMode = () => import('./GameContainer');
export const loadRunningGameMode = () => import('./game/RunningGameUI');

function useCaptchaLogic(isAuthenticated: boolean) {
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const { setHasUserInteracted, soundManagerRef } = useAudio();
  const { toast } = useToast();

  useEffect(() => {
    try {
      if (sessionStorage.getItem('captcha_verified_session') === 'true') {
        setCaptchaVerified(true);
      }
    } catch {
      logger.warn("Failed to access sessionStorage");
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !captchaVerified) {
      setCaptchaVerified(true);
      try {
        sessionStorage.setItem('captcha_verified_session', 'true');
      } catch { /* ignore */ }
    }
  }, [isAuthenticated, captchaVerified]);

  const handleCaptchaSuccess = () => {
    logger.log("[ClientGameContainer] Captcha verified successfully.");
    setCaptchaVerified(true);
    setHasUserInteracted(true);
    soundManagerRef.current?.playCurrentTrack();
    toast({ title: 'Verification Successful', description: 'You can now connect your wallet.', duration: 3000 });
    try {
      sessionStorage.setItem('captcha_verified_session', 'true');
    } catch {
      logger.warn("Failed to save captcha state");
    }
  };

  return { captchaVerified, handleCaptchaSuccess };
}

function useOnboardingLogic(isLoading: boolean, isAuthenticated: boolean, hasPasskey: boolean) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasPasskey) {
      const dismissed = localStorage.getItem('passkey_onboarding_dismissed');
      const now = Date.now();
      if (!dismissed || (now - parseInt(dismissed)) > 3 * 24 * 60 * 60 * 1000) {
        setShowOnboarding(true);
      }
    }
  }, [isLoading, isAuthenticated, hasPasskey]);

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('passkey_onboarding_dismissed', Date.now().toString());
  };

  return { showOnboarding, handleCloseOnboarding };
}

function useClientGameContainerLogic() {
  const { isAuthenticated, hasPasskey, isLoading } = useAuthContext();
  const { captchaVerified, handleCaptchaSuccess } = useCaptchaLogic(isAuthenticated);
  const { showOnboarding, handleCloseOnboarding } = useOnboardingLogic(isLoading, isAuthenticated, hasPasskey);

  return {
    isAuthenticated,
    isLoading,
    showOnboarding,
    captchaVerified,
    siteKey: RECAPTCHA_SITE_KEY,
    handleCaptchaSuccess,
    handleCloseOnboarding,
  };
}

export default function ClientGameContainer() {
  const {
    isAuthenticated,
    isLoading,
    showOnboarding,
    captchaVerified,
    siteKey,
    handleCaptchaSuccess,
    handleCloseOnboarding,
  } = useClientGameContainerLogic();

  if (isLoading) {
    return <LoadingScreen message="" showLogo variant="indeterminate" />;
  }

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
