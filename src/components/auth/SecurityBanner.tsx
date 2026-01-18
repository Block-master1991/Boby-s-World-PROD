'use client';

import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/contexts/AuthContext';
import { ArrowRight, Shield } from 'lucide-react';
import React, { useState } from 'react';
import { PasskeyOnboardingModal } from './PasskeyOnboardingModal';

const BannerContent: React.FC<{ onDismiss: () => void; onEnable: () => void }> = ({ onDismiss, onEnable }) => (
    <div className="bg-amber-500/10 border-b border-amber-500/20 p-3 relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent w-full h-full animate-pulse" />
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10 px-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-full">
                    <Shield className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                    <p className="text-sm font-medium text-amber-200">Secure your account with Biometrics</p>
                    <p className="text-xs text-amber-200/60 hidden sm:block">Protect your assets and enable faster logins with Passkey.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-amber-200 hover:text-amber-100 hover:bg-amber-500/20 text-xs" onClick={onDismiss}>Dismiss</Button>
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-8 text-xs px-4" onClick={onEnable}>Enable Now <ArrowRight className="w-3 h-3 ml-1" /></Button>
            </div>
        </div>
    </div>
);

export const SecurityBanner: React.FC = () => {
    const { isAuthenticated, hasPasskey, isLoading } = useAuthContext();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    if (isLoading || !isAuthenticated || hasPasskey || !isVisible) return null;

    return (
        <>
            <BannerContent onDismiss={() => setIsVisible(false)} onEnable={() => setIsModalOpen(true)} />
            <PasskeyOnboardingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
};
