'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

interface PWAInstallHook {
    isInstallable: boolean;
    isInstalled: boolean;
    promptInstall: () => Promise<void>;
    dismissPrompt: () => void;
}

export const usePWAInstall = (): PWAInstallHook => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed
        const checkInstalled = () => {
            if (typeof window !== 'undefined') {
                // Check if running as PWA (standalone mode)
                const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
                // Check if running as PWA from home screen
                const isInWebAppiOS = (window.navigator as any).standalone === true;

                setIsInstalled(isStandalone || isInWebAppiOS);
            }
        };

        checkInstalled();

        // Listen for the beforeinstallprompt event
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        // Listen for successful installation
        const handleAppInstalled = () => {
            setDeferredPrompt(null);
            setIsInstallable(false);
            setIsInstalled(true);
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.addEventListener('appinstalled', handleAppInstalled);

            // Also check for display mode changes
            const mediaQuery = window.matchMedia('(display-mode: standalone)');
            mediaQuery.addEventListener('change', checkInstalled);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
                window.removeEventListener('appinstalled', handleAppInstalled);
            }
        };
    }, []);

    const promptInstall = async (): Promise<void> => {
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
    };

    const dismissPrompt = () => {
        setDeferredPrompt(null);
        setIsInstallable(false);
    };

    return {
        isInstallable,
        isInstalled,
        promptInstall,
        dismissPrompt,
    };
};
