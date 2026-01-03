
'use client';

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dog, Shield, Globe, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@solana/wallet-adapter-react';


const SecurityBadge = ({ level }: { level: string }) => {
    const colors: Record<string, string> = {
        Standard: 'bg-zinc-500/20 text-zinc-100 border-zinc-500/30',
        Enhanced: 'bg-blue-500/20 text-blue-200 border-blue-500/30',
        Maximum: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
    };
    const icon = level === 'Maximum' ? <Zap size={12} /> : level === 'Enhanced' ? <Shield size={12} /> : <CheckCircle2 size={12} />;

    return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${colors[level]}`}>
            {icon}
            {level} Protection
        </div>
    );
};

const ConnectivityIndicator = ({ isOnline }: { isOnline: boolean }) => (
    <div className={`flex items-center gap-1.5 text-[10px] font-medium ${isOnline ? 'text-green-400' : 'text-amber-400'}`}>
        <Globe size={12} className={isOnline ? '' : 'animate-pulse'} />
        {isOnline ? 'Online' : 'Offline Mode'}
    </div>
);

const Header: React.FC = () => {
    const [isClient, setIsClient] = useState(false);
    const { isAuthenticated, isLoading, login, logout, user, securityLevel, isOnline } = useAuth();
    const { connected } = useWallet();

    useEffect(() => {
        setIsClient(true);
    }, []);

    const handleAuthAction = async () => {
        if (isAuthenticated) {
            await logout();
        } else {
            await login();
        }
    };

    return (
        <header className="bg-primary text-primary-foreground p-4 shadow-md">
            <div className="container mx-auto flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Dog className="h-8 w-8" />
                    <h1 className="text-2xl font-headline font-bold">Boby World</h1>
                    {isClient && (
                        <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-primary-foreground/20">
                            <SecurityBadge level={securityLevel} />
                            <ConnectivityIndicator isOnline={isOnline} />
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {isClient && (
                        <Button
                            onClick={handleAuthAction}
                            disabled={isLoading || (connected && isAuthenticated && !user)} // Disable if loading or connected but user not loaded yet
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                            {isLoading ? '' : (isAuthenticated ? 'Logout' : 'Login')}
                        </Button>
                    )}
                    {isClient ? (
                        <WalletMultiButton style={{ backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }} />
                    ) : (
                        <Button
                            className="wallet-adapter-button-trigger"
                            style={{
                                backgroundColor: 'hsl(var(--accent))',
                                color: 'hsl(var(--accent-foreground))',
                            }}
                            disabled
                            aria-label="Loading wallet button"
                        >
                            Select Wallet
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
