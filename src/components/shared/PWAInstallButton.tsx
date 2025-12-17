'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';

interface PWAInstallButtonProps {
    variant?: 'button' | 'banner' | 'floating';
    showOnlyOnMobile?: boolean;
    autoShow?: boolean;
    className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
    variant = 'button',
    showOnlyOnMobile = true,
    autoShow = false,
    className = ''
}) => {
    const { isInstallable, isInstalled, promptInstall, dismissPrompt } = usePWAInstall();
    const isMobile = useIsMobile();
    const { toast } = useToast();
    const [showBanner, setShowBanner] = useState(autoShow);
    const [isInstalling, setIsInstalling] = useState(false);

    // Don't show if not installable, already installed, or mobile-only restriction
    if (!isInstallable || isInstalled || (showOnlyOnMobile && !isMobile)) {
        return null;
    }

    const handleInstall = async () => {
        setIsInstalling(true);
        try {
            await promptInstall();
            toast({
                title: 'Installing Boby World',
                description: 'The app is being installed on your device.',
            });
        } catch (error) {
            toast({
                title: 'Installation Failed',
                description: 'Could not install the app. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsInstalling(false);
        }
    };

    const handleDismiss = () => {
        dismissPrompt();
        setShowBanner(false);
        toast({
            title: 'Install Later',
            description: 'You can install Boby World anytime from your browser menu.',
        });
    };

    if (variant === 'banner' && showBanner) {
        return (
            <div className={`fixed bottom-4 left-4 right-4 z-50 bg-primary text-primary-foreground p-4 rounded-lg shadow-lg border ${className}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Smartphone className="h-6 w-6" />
                        <div>
                            <h3 className="font-semibold text-sm">Install Boby World</h3>
                            <p className="text-xs opacity-90">Play offline and get the best experience</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleInstall}
                            disabled={isInstalling}
                            className="text-xs"
                        >
                            {isInstalling ? 'Installing...' : 'Install'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDismiss}
                            className="h-8 w-8 p-0"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (variant === 'floating') {
        return (
            <Button
                onClick={handleInstall}
                disabled={isInstalling}
                className={`fixed bottom-6 right-6 z-50 rounded-full h-14 w-14 shadow-lg ${className}`}
                size="icon"
            >
                <Download className="h-6 w-6" />
            </Button>
        );
    }

    // Default button variant
    return (
        <Button
            onClick={handleInstall}
            disabled={isInstalling}
            variant="outline"
            className={`flex items-center gap-2 ${className}`}
        >
            <Download className="h-4 w-4" />
            {isInstalling ? 'Installing...' : 'Install App'}
        </Button>
    );
};
