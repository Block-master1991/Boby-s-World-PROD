'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { PawPrint } from 'lucide-react';
import Image from 'next/image';

export default function AuthCallback() {
    const router = useRouter();
    const { connected } = useWallet();

    useEffect(() => {
        if (connected) {
            // Redirect immediately to game after successful login
            router.push('/');
        } else {
            // If not connected after a short delay, redirect anyway
            const timer = setTimeout(() => router.push('/'), 2000);
            return () => clearTimeout(timer);
        }
    }, [connected, router]);

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
            <PawPrint className="h-12 w-12 text-green-500 mb-4" />
            <h1 className="text-3xl font-bold mb-4 font-headline text-green-600">Login Successful!</h1>
            <p className="text-lg text-muted-foreground text-center max-w-md">
                Welcome to Boby World! Redirecting to game...
            </p>
        </div>
    );
}
