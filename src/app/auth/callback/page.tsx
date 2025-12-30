'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/hooks/useAuth';
import { PawPrint, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

export default function AuthCallback() {
    const router = useRouter();
    const { connected, publicKey } = useWallet();
    const { isAuthenticated, isLoading: isAuthLoading, login, error: authError } = useAuth();
    const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
    const [loginAttempted, setLoginAttempted] = useState(false);

    // Manual Trigger for Callback
    const handleManualLogin = async () => {
        if (!connected || !publicKey) return;
        setLoginAttempted(true);
        try {
            const loginSuccess = await login();
            if (loginSuccess) {
                router.push('/');
            }
        } catch (error) {
            console.error('Login failed:', error);
        }
    };

    // Auto-login REMOVED for stability.
    // If a user lands here, we show them a button to finish.

    const getContent = () => {
        if (isAuthenticated) {
            return {
                icon: <PawPrint className="h-12 w-12 text-green-500 mb-4" />,
                title: "Login Successful!",
                message: "Welcome back!",
                subtitle: "Redirecting..."
            };
        }

        if (connected && !isAuthenticated) {
            return {
                icon: <PawPrint className="h-12 w-12 text-primary mb-4" />,
                title: "Almost There!",
                message: "Wallet connected successfully.",
                subtitle: "Click below to sign in.",
                action: (
                    <button
                        onClick={handleManualLogin}
                        className="mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold animate-pulse hover:animate-none"
                    >
                        Complete Login
                    </button>
                )
            };
        }

        return {
            icon: <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />,
            title: "Connecting...",
            message: "Waiting for wallet reconnection...",
            subtitle: "Please wait."
        };
    };

    const content = getContent();

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <Image
                src="/Boby-logo.png"
                alt="Boby World"
                width={120}
                height={120}
                className="rounded-md opacity-90 mb-8"
                style={{ width: 'auto', height: 'auto' }}
                priority
            />
            {content.icon}
            <h1 className="text-3xl font-bold mb-4 font-headline text-center">
                {content.title}
            </h1>
            <p className="text-lg text-muted-foreground text-center max-w-md mb-2">
                {content.message}
            </p>
            {content.subtitle && (
                <p className="text-sm text-muted-foreground text-center max-w-md">
                    {content.subtitle}
                </p>
            )}

            {/* Render Action Button if present (for manual login) */}
            {(content as any).action && (
                <div className="mt-4">
                    {(content as any).action}
                </div>
            )}
        </div>
    );
}
