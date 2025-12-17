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

    useEffect(() => {
        const handleCallback = async () => {
            // If already authenticated, redirect to game
            if (isAuthenticated) {
                console.log('[AuthCallback] User already authenticated, redirecting to game');
                router.push('/');
                return;
            }

            // If wallet is connected and we haven't attempted login yet
            if (connected && publicKey && !loginAttempted && !isAuthLoading) {
                console.log('[AuthCallback] Wallet connected, attempting automatic login');
                setLoginAttempted(true);
                setHasAttemptedLogin(true);

                try {
                    const loginSuccess = await login();
                    if (loginSuccess) {
                        console.log('[AuthCallback] Login successful, redirecting to game');
                        router.push('/');
                    } else {
                        console.warn('[AuthCallback] Login failed, redirecting to home');
                        // Redirect after a delay to show error
                        setTimeout(() => router.push('/'), 3000);
                    }
                } catch (error) {
                    console.error('[AuthCallback] Login error:', error);
                    // Redirect after a delay to show error
                    setTimeout(() => router.push('/'), 3000);
                }
            }
            // If wallet not connected after a delay, redirect anyway
            else if (!connected && !hasAttemptedLogin) {
                const timer = setTimeout(() => {
                    console.log('[AuthCallback] Wallet not connected, redirecting to home');
                    router.push('/');
                }, 3000);
                return () => clearTimeout(timer);
            }
        };

        handleCallback();
    }, [connected, publicKey, isAuthenticated, isAuthLoading, login, loginAttempted, hasAttemptedLogin, router]);

    // Determine what to show based on current state
    const getContent = () => {
        if (isAuthLoading || (connected && !isAuthenticated && !authError)) {
            return {
                icon: <PawPrint className="h-12 w-12 animate-pulse text-primary mb-4" />,
                title: "Processing authentication...",
                message: "Please wait while we complete your login.",
                subtitle: "Check your wallet if prompted for approval."
            };
        }

        if (authError) {
            return {
                icon: <AlertTriangle className="h-12 w-12 text-destructive mb-4" />,
                title: "Authentication Failed",
                message: authError,
                subtitle: "Redirecting back to login..."
            };
        }

        if (isAuthenticated) {
            return {
                icon: <PawPrint className="h-12 w-12 text-green-500 mb-4" />,
                title: "Login Successful!",
                message: "Welcome to Boby World! Redirecting to game...",
                subtitle: ""
            };
        }

        if (!connected) {
            return {
                icon: <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />,
                title: "Wallet Not Connected",
                message: "Please connect your wallet to continue.",
                subtitle: "Redirecting back to login..."
            };
        }

        return {
            icon: <PawPrint className="h-12 w-12 animate-pulse text-primary mb-4" />,
            title: "Processing...",
            message: "Completing authentication...",
            subtitle: ""
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
        </div>
    );
}
