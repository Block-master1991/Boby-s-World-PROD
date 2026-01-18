'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePasskeyOnboarding } from '@/hooks/usePasskeyOnboarding';
import { Shield } from 'lucide-react';
import React from 'react';
import { IntroStep, RegisterStep, SuccessStep } from './PasskeyOnboardingSteps';

interface PasskeyOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPasskeyRegistered?: () => void;
}

const getStepContent = (step: string) => {
    switch (step) {
        case 'intro': return { title: 'Secure Your Account with Passkey', desc: 'Add biometric authentication for faster, more secure logins.' };
        case 'register': return { title: 'Registering Passkey...', desc: 'Follow the prompts on your device to complete registration.' };
        case 'success': return { title: 'Passkey Registered!', desc: 'Your account is now more secure with passkey authentication.' };
        default: return { title: '', desc: '' };
    }
};

export const PasskeyOnboardingModal: React.FC<PasskeyOnboardingModalProps> = ({ isOpen, onClose, onPasskeyRegistered }) => {
    const { step, description, setDescription, registerPasskey, handleClose } = usePasskeyOnboarding(isOpen, onClose, onPasskeyRegistered);
    const { title, desc } = getStepContent(step);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-blue-500" /> {title}</DialogTitle>
                    <DialogDescription>{desc}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    {step === 'intro' && <IntroStep description={description} setDescription={setDescription} onClose={handleClose} onRegister={registerPasskey} />}
                    {step === 'register' && <RegisterStep />}
                    {step === 'success' && <SuccessStep onClose={handleClose} />}
                </div>
            </DialogContent>
        </Dialog>
    );
};
