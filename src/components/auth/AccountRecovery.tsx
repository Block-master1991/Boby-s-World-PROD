'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, ShieldCheck, ArrowRight, Loader2, Key } from 'lucide-react';

export const AccountRecovery: React.FC = () => {
    const { toast } = useToast();
    const [step, setStep] = useState<'initiate' | 'verify'>('initiate');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [publicKey, setPublicKey] = useState('');

    const handleInitiate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        try {
            setLoading(true);
            const response = await fetch('/api/auth/recovery/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                setPublicKey(data.publicKey);
                setStep('verify');
                toast({
                    title: 'Recovery Email Sent',
                    description: 'Please check your inbox for the recovery code.',
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: data.error || 'Failed to initiate recovery.',
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'An unexpected error occurred.',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code) return;

        try {
            setLoading(true);
            const response = await fetch('/api/auth/recovery/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicKey, code }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Account Recovered',
                    description: 'You can now set up a new passkey.',
                });
                // Redirect to passkey setup or home
                window.location.href = '/settings/security';
            } else {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: data.error || 'Invalid or expired code.',
                });
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'An unexpected error occurred.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto shadow-xl border-t-4 border-t-primary">
            <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Key className="h-6 w-6 text-primary" />
                    </div>
                </div>
                <CardTitle className="text-2xl font-bold">Account Recovery</CardTitle>
                <CardDescription>
                    {step === 'initiate'
                        ? 'Enter your email to receive a recovery code and regain access to your account.'
                        : 'Enter the 6-digit code sent to your email to verify your identity.'}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={step === 'initiate' ? handleInitiate : handleVerify} className="space-y-4">
                    {step === 'initiate' ? (
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    className="pl-10"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="code">Verification Code</Label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="code"
                                    placeholder="Enter 6-digit code"
                                    className="pl-10 text-center text-2xl tracking-[0.5em] font-mono"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    required
                                />
                            </div>
                            <p className="text-xs text-center text-muted-foreground mt-2">
                                Code was sent to <strong>{email}</strong>
                            </p>
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <>
                                {step === 'initiate' ? 'Send Recovery Code' : 'Verify & Continue'}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2 border-t pt-4">
                {step === 'verify' && (
                    <Button
                        variant="link"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setStep('initiate')}
                        disabled={loading}
                    >
                        Try a different email
                    </Button>
                )}
                <p className="text-xs text-center text-muted-foreground">
                    This process helps protect your account from unauthorized access.
                    A 24-hour cooldown period may apply after successful verification.
                </p>
            </CardFooter>
        </Card>
    );
};
