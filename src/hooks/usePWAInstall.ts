'use client';

import { logger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
    standalone?: boolean;
}

interface PWAInstallHook {
    isInstallable: boolean;
    isInstalled: boolean;
    promptInstall: () => Promise<void>;
    dismissPrompt: () => void;
}

/**
 * Checks if the app is currently running in standalone mode (PWA).
 */
const checkStandalone = (): boolean => {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInWebAppiOS = (window.navigator as NavigatorWithStandalone).standalone === true;
    return isStandalone || isInWebAppiOS;
};

/**
 * Handles PWA state management and event listeners.
 */
const usePWAState = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        const check = () => setIsInstalled(checkStandalone());
        const handlePrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };
        const handleAppInstalled = () => {
            setDeferredPrompt(null);
            setIsInstallable(false);
            setIsInstalled(true);
        };

        check();
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeinstallprompt', handlePrompt);
            window.addEventListener('appinstalled', handleAppInstalled);
            window.matchMedia('(display-mode: standalone)').addEventListener('change', check);
        }
        return () => {
            window.removeEventListener('beforeinstallprompt', handlePrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    return {
        deferredPrompt,
        setDeferredPrompt,
        isInstallable,
        setIsInstallable,
        isInstalled
    };
};

export const usePWAInstall = (): PWAInstallHook => {
    const {
        deferredPrompt,
        setDeferredPrompt,
        isInstallable,
        setIsInstallable,
        isInstalled
    } = usePWAState();

    const promptInstall = useCallback(async (): Promise<void> => {
        if (!deferredPrompt) {
            throw new Error('Install prompt not available');
        }

        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                logger.log('User accepted the install prompt');
            } else {
                logger.log('User dismissed the install prompt');
            }

            setDeferredPrompt(null);
            setIsInstallable(false);
        } catch (error) {
            logger.error('Error prompting install:', error);
            throw error;
        }
    }, [deferredPrompt, setDeferredPrompt, setIsInstallable]);

    const dismissPrompt = useCallback(() => {
        setDeferredPrompt(null);
        setIsInstallable(false);
    }, [setDeferredPrompt, setIsInstallable]);

    return {
        isInstallable,
        isInstalled,
        promptInstall,
        dismissPrompt,
    };
};
