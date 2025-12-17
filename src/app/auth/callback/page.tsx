'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { PawPrint } from 'lucide-react';
import Image from 'next/image';

export default function AuthCallback() {
    const router = useRouter();
    const { connected, connecting } = useWallet();

    useEffect(() => {
        // Small delay to allow wallet connection to complete
        const timer = setTimeout(() => {
            if (connected) {
                // Redirect back to main page after successful connection
                router.push('/');
            } else if (!connecting) {
                // If not connected and not connecting, redirect to home
                router.push('/');
            }
        }, 3000);

        return () => clearTimeout(timer);
    }, [connected, connecting, router]);

    const getStatusMessage = () => {
        if (connecting) {
            return {
                title: 'Connecting to Wallet',
                description: 'Establishing secure connection with your wallet...',
                progress: 33
            };
        }
        if (connected) {
            return {
                title: 'Connection Successful!',
                description: 'Wallet connected successfully. Completing authentication...',
                progress: 66
            };
        }
        return {
            title: 'Preparing Authentication',
            description: 'Setting up secure authentication process...',
            progress: 10
        };
    };

    const status = getStatusMessage();

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <div className="relative mb-8">
                <Image
                    src="/Boby-logo.png"
                    alt="Boby World"
                    width={120}
                    height={120}
                    className="rounded-md opacity-90"
                    style={{ width: 'auto', height: 'auto' }}
                    priority
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                </div>
            </div>

            <div className="text-center mb-8">
                <PawPrint className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
                <h1 className="text-3xl font-bold mb-4 font-headline">{status.title}</h1>
                <p className="text-lg text-muted-foreground text-center max-w-md mb-6">
                    {status.description}
                </p>

                {/* Progress Bar */}
                <div className="w-full max-w-xs mx-auto mb-6">
                    <div className="w-full bg-secondary rounded-full h-2">
                        <div
                            className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${status.progress}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{status.progress}% Complete</p>
                </div>

                {/* Animated dots */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    <div className="flex gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            </div>

            <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                    Please keep this page open while we complete the authentication process.
                </p>
                <button
                    onClick={() => router.push('/')}
                    className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
                >
                    Continue to Game
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                    Auto-redirect in a few seconds...
                </p>
            </div>
        </div>
    );
}
