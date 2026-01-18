'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, Key } from 'lucide-react';
import React from 'react';

export const IntroStep: React.FC<{
    description: string;
    setDescription: (val: string) => void;
    onClose: () => void;
    onRegister: () => void;
}> = ({ description, setDescription, onClose, onRegister }) => (
    <>
        <div className="space-y-3">
            <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-green-500 mt-0.5" />
                <div>
                    <p className="font-medium">Enhanced Security</p>
                    <p className="text-sm text-muted-foreground">Protect your account with biometric authentication.</p>
                </div>
            </div>
            <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                <div>
                    <p className="font-medium">Faster Login</p>
                    <p className="text-sm text-muted-foreground">Skip passwords and log in with fingerprint or face ID.</p>
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
            <Button variant="outline" onClick={onClose} className="flex-1">Maybe Later</Button>
            <Button onClick={onRegister} className="flex-1">Set Up Passkey</Button>
        </div>
    </>
);

export const RegisterStep = () => (
    <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Follow the prompts on your device to complete passkey registration.</p>
    </div>
);

export const SuccessStep: React.FC<{ onClose: () => void }> = ({ onClose }) => (
    <div className="text-center py-8">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">Passkey Registered!</p>
        <p className="text-sm text-muted-foreground mb-4">You can now log in using biometric authentication.</p>
        <Button onClick={onClose} className="w-full">Continue</Button>
    </div>
);
