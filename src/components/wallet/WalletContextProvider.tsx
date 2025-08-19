
'use client';

import type { FC, ReactNode } from 'react';
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { WalletConnectWalletAdapter } from '@solana/wallet-adapter-walletconnect';
import { SOL_NETWORK } from '@/lib/constants';
import { useIsMobile } from '@/hooks/use-mobile';

interface WalletContextProps {
    children: ReactNode;
}

const WalletContextProvider: FC<WalletContextProps> = ({ children }) => {
    const network = WalletAdapterNetwork.Mainnet; 
    
    const endpoint = useMemo(() => SOL_NETWORK, []);

    const isMobile = useIsMobile();

    const wallets = useMemo(() => {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bobys.world';
        const commonWallets = [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ];

        if (isMobile) {
            return [
                new WalletConnectWalletAdapter({
                    network: network,
                    options: {
                        projectId: 'dfb2352907cc6782c27d341779f26375',
                        metadata: {
                            name: 'Bobys World',
                            description: 'Boby\'s World Game',
                            url: appUrl,
                            icons: [`${appUrl}/Boby-logo.png`],
                            redirect: {
                                native: appUrl,
                                universal: appUrl
                            }
                        }
                    }
                }),
            ];
        }

        return commonWallets;
    }, [isMobile, network]);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={true}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletContextProvider;
