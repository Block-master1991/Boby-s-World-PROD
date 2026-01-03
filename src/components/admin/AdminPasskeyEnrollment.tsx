'use client';

import React, { useState, useEffect } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasskeyOnboardingModal } from '@/components/auth/PasskeyOnboardingModal';

export const AdminPasskeyEnrollment: React.FC = () => {
    const { isAuthenticated, user } = useAuthContext();
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const reason = searchParams.get('reason');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [enrolling, setEnrolling] = useState(false);

    useEffect(() => {
        // Auto-open modal if admin needs to set up passkey
        if (reason === 'required') {
            setIsModalOpen(true);
        }
    }, [reason]);

    const handlePasskeyRegistered = () => {
        setIsModalOpen(false);
        toast({
            title: 'Admin Passkey Set Up',
            description: 'Your admin account is now secured with biometric authentication.',
        });
        // Redirect back to admin dashboard or intended page
        router.push('/admin');
    };

    if (!isAuthenticated) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">Please log in to access admin features.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="container mx-auto py-8">
            <Card className="max-w-2xl mx-auto">
                <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2 text-red-600">
                        <Shield className="h-6 w-6" />
                        Admin Security Setup Required
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            As an administrator, you must set up biometric authentication (Passkey) to access admin features.
                            This is a security requirement to protect sensitive administrative functions.
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <Key className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                                <p className="font-medium">Enhanced Admin Security</p>
                                <p className="text-sm text-muted-foreground">
                                    Biometric authentication provides an extra layer of protection for admin accounts.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <Shield className="h-5 w-5 text-green-500 mt-0.5" />
                            <div>
                                <p className="font-medium">Compliance & Auditing</p>
                                <p className="text-sm text-muted-foreground">
                                    Ensures all admin actions are properly authenticated and logged.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1"
                            disabled={enrolling}
                        >
                            <Key className="h-4 w-4 mr-2" />
                            Set Up Admin Passkey
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => router.push('/')}
                            className="flex-1"
                        >
                            Return to Home
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <PasskeyOnboardingModal
                isOpen={isModalOpen}
                onClose={() => {
                    // Don't allow closing if required
                    if (reason === 'required') {
                        toast({
                            variant: 'destructive',
                            title: 'Setup Required',
                            description: 'Passkey setup is mandatory for admin access.',
                        });
                    } else {
                        setIsModalOpen(false);
                    }
                }}
                onPasskeyRegistered={handlePasskeyRegistered}
            />
        </div>
    );
};
