
'use client';

import React, { useState, useEffect } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@solana/wallet-adapter-react';

const Header: React.FC = () => {
    const [isClient, setIsClient] = useState(false);
    const { isAuthenticated, isLoading, login, logout, user } = useAuth();
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
                    <h1 className="text-2xl font-headline font-bold">Boby's World</h1>
                </div>
                <div className="flex items-center gap-4">
                    {isClient && (
                        <Button
                            onClick={handleAuthAction}
                            disabled={isLoading || (connected && isAuthenticated && !user)} // Disable if loading or connected but user not loaded yet
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                            {isLoading ? 'Loading...' : (isAuthenticated ? 'Logout' : 'Login')}
                        </Button>
                    )}
                    {isClient ? (
                        <WalletMultiButton style={{ backgroundColor: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}/>
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
