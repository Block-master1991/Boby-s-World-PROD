'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { fetchWithCsrf } from '@/lib/utils';
import { ArrowRight, Key, Loader2, Mail, ShieldCheck, Wallet, XCircle } from 'lucide-react';
import React, { useCallback, useState } from 'react';

// --- Form Sub-components ---

interface InitiateFormProps {
    email: string;
    setEmail: (v: string) => void;
    walletAddress: string;
    setWalletAddress: (v: string) => void;
    loading: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

const InitiateForm: React.FC<InitiateFormProps> = ({ email, setEmail, walletAddress, setWalletAddress, loading, onSubmit }) => (
    <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="wallet">Wallet Address</Label>
            <div className="relative">
                <Wallet className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="wallet" type="text" placeholder="Your Solana wallet address" className="pl-10 font-mono text-xs" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} required />
            </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="name@example.com" className="pl-10" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <>Send Recovery Code<ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
    </form>
);

interface VerifyFormProps {
    email: string;
    code: string;
    setCode: (v: string) => void;
    loading: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

const VerifyForm: React.FC<VerifyFormProps> = ({ email, code, setCode, loading, onSubmit }) => (
    <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="code">Verification Code</Label>
            <div className="relative">
                <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input id="code" placeholder="Enter 6-digit code" className="pl-10 text-center text-2xl tracking-[0.5em] font-mono" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2">Code was sent to <strong>{email}</strong></p>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <>Verify & Continue<ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
    </form>
);

// --- Card Section Sub-components ---

const RecoveryCardHeader: React.FC<{ step: 'initiate' | 'verify' }> = ({ step }) => (
    <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 mb-2"><div className="p-2 bg-primary/10 rounded-lg"><Key className="h-6 w-6 text-primary" /></div></div>
        <CardTitle className="text-2xl font-bold">Account Recovery</CardTitle>
        <CardDescription>{step === 'initiate' ? 'Enter your wallet address and email to receive a recovery code.' : 'Enter the 6-digit code sent to your email.'}</CardDescription>
    </CardHeader>
);

interface RecoveryCardFooterProps {
    step: 'initiate' | 'verify';
    loading: boolean;
    onRetry: () => void;
    onCancel: () => void;
}

const RecoveryCardFooter: React.FC<RecoveryCardFooterProps> = ({ step, loading, onRetry, onCancel }) => (
    <CardFooter className="flex flex-col space-y-2 border-t pt-4">
        {step === 'verify' && (
            <div className="flex gap-2 w-full">
                <Button variant="outline" size="sm" className="flex-1" onClick={onRetry} disabled={loading}>Try different email</Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={onCancel} disabled={loading}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
            </div>
        )}
        <p className="text-xs text-center text-muted-foreground">This process protects your account from unauthorized access.</p>
    </CardFooter>
);

// --- Custom Hook for Recovery Logic ---

const useRecoveryHandlers = (toast: ReturnType<typeof useToast>['toast']) => {
    const [step, setStep] = useState<'initiate' | 'verify'>('initiate');
    const [email, setEmail] = useState('');
    const [walletAddress, setWalletAddress] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [recoveryToken, setRecoveryToken] = useState('');

    const handleInitiate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !walletAddress) return;
        setLoading(true);
        try {
            const res = await fetchWithCsrf('/api/auth/recovery/initiate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, publicKey: walletAddress }) });
            const data = await res.json();
            if (res.ok) { setRecoveryToken(data.token); setStep('verify'); toast({ title: 'Recovery Email Sent', description: 'Check your inbox.' }); }
            else { toast({ variant: 'destructive', title: 'Error', description: data.error || 'Failed.' }); }
        } catch { toast({ variant: 'destructive', title: 'Error', description: 'Unexpected error.' }); }
        finally { setLoading(false); }
    }, [email, walletAddress, toast]);

    const handleVerify = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || !recoveryToken) return;
        setLoading(true);
        try {
            const res = await fetchWithCsrf('/api/auth/recovery/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recoveryToken, recoveryCode: code }) });
            const data = await res.json();
            if (res.ok) { toast({ title: 'Account Recovered', description: 'Please sign in again with your wallet.' }); window.location.href = '/'; }
            else { toast({ variant: 'destructive', title: 'Error', description: data.error || 'Invalid code.' }); }
        } catch { toast({ variant: 'destructive', title: 'Error', description: 'Unexpected error.' }); }
        finally { setLoading(false); }
    }, [code, recoveryToken, toast]);

    const handleCancel = useCallback(async () => {
        if (!recoveryToken) return;
        setLoading(true);
        try {
            await fetchWithCsrf('/api/auth/recovery/verify', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recoveryToken }) });
            toast({ title: 'Recovery Cancelled' });
            setStep('initiate'); setRecoveryToken(''); setCode('');
        } catch { toast({ variant: 'destructive', title: 'Error', description: 'Failed to cancel.' }); }
        finally { setLoading(false); }
    }, [recoveryToken, toast]);

    const handleRetry = useCallback(() => setStep('initiate'), []);

    return { step, email, setEmail, walletAddress, setWalletAddress, code, setCode, loading, handleInitiate, handleVerify, handleCancel, handleRetry };
};

// --- Main Component (Concise) ---

export const AccountRecovery: React.FC = () => {
    const { toast } = useToast();
    const { step, email, setEmail, walletAddress, setWalletAddress, code, setCode, loading, handleInitiate, handleVerify, handleCancel, handleRetry } = useRecoveryHandlers(toast);

    return (
        <Card className="w-full max-w-md mx-auto shadow-xl border-t-4 border-t-primary">
            <RecoveryCardHeader step={step} />
            <CardContent>
                {step === 'initiate' 
                    ? <InitiateForm email={email} setEmail={setEmail} walletAddress={walletAddress} setWalletAddress={setWalletAddress} loading={loading} onSubmit={handleInitiate} />
                    : <VerifyForm email={email} code={code} setCode={setCode} loading={loading} onSubmit={handleVerify} />
                }
            </CardContent>
            <RecoveryCardFooter step={step} loading={loading} onRetry={handleRetry} onCancel={handleCancel} />
        </Card>
    );
};
