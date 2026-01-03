'use client';

import React, { useState, useEffect } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { Shield, Key, CheckCircle } from 'lucide-react';
import { useApiFetch } from '@/utils/api';

import { uint8ArrayToBase64url, safeBufferFromBase64url } from '@/utils/base64';

interface PasskeyOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPasskeyRegistered?: () => void;
}

export const PasskeyOnboardingModal: React.FC<PasskeyOnboardingModalProps> = ({
    isOpen,
    onClose,
    onPasskeyRegistered,
}) => {
    const { user, hasPasskey } = useAuthContext();
    const { toast } = useToast();
    const [step, setStep] = useState<'intro' | 'register' | 'success'>('intro');
    const [registering, setRegistering] = useState(false);
    const [description, setDescription] = useState('');
    const { apiFetch } = useApiFetch();

    useEffect(() => {
        if (isOpen) {
            setStep('intro');
            setDescription('');
        }
    }, [isOpen]);

    const { registerPasskey: registerPasskeyHook } = useAuthContext();

    const registerPasskey = async () => {
        if (!description.trim()) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Please enter a device description.',
            });
            return;
        }

        try {
            setRegistering(true);
            setStep('register');

            const success = await registerPasskeyHook(description.trim());

            if (success) {
                setStep('success');
                onPasskeyRegistered?.();
            } else {
                setStep('intro');
            }
        } catch (error) {
            logger.error('Error registering passkey:', error);
            setStep('intro');
        } finally {
            setRegistering(false);
        }
    };

    const handleClose = () => {
        if (step === 'success') {
            onClose();
        } else {
            // Allow skipping for now
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5 text-blue-500" />
                        {step === 'intro' && 'Secure Your Account with Passkey'}
                        {step === 'register' && 'Registering Passkey...'}
                        {step === 'success' && 'Passkey Registered!'}
                    </DialogTitle>
                    <DialogDescription>
                        {step === 'intro' && 'Add biometric authentication for faster, more secure logins.'}
                        {step === 'register' && 'Follow the prompts on your device to complete registration.'}
                        {step === 'success' && 'Your account is now more secure with passkey authentication.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {step === 'intro' && (
                        <>
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <Key className="h-5 w-5 text-green-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium">Enhanced Security</p>
                                        <p className="text-sm text-muted-foreground">
                                            Protect your account with biometric authentication.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium">Faster Login</p>
                                        <p className="text-sm text-muted-foreground">
                                            Skip passwords and log in with fingerprint or face ID.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="device-description">Device Name (optional)</Label>
                                <Input
                                    id="device-description"
                                    placeholder="e.g., My iPhone, Work Laptop"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="mt-1"
                                />
                            </div>

                            <div className="flex gap-2">
                                <Button variant="outline" onClick={handleClose} className="flex-1">
                                    Maybe Later
                                </Button>
                                <Button onClick={registerPasskey} className="flex-1">
                                    Set Up Passkey
                                </Button>
                            </div>
                        </>
                    )}

                    {step === 'register' && (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p>Follow the prompts on your device to complete passkey registration.</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-8">
                            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                            <p className="text-lg font-medium mb-2">Passkey Registered!</p>
                            <p className="text-sm text-muted-foreground mb-4">
                                You can now log in using biometric authentication.
                            </p>
                            <Button onClick={handleClose} className="w-full">
                                Continue
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
