
'use client';

import type { WalletAdapter } from '@solana/wallet-adapter-base';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import type { FC, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
// Removed static import of WalletConnectWalletAdapter for bundle optimization
import { useIsMobile } from '@/hooks/use-mobile';
import { SOL_NETWORK } from '@/lib/constants';
import { logger } from '@/utils/logger';

interface WalletContextProps {
    children: ReactNode;
}

const WalletContextProvider: FC<WalletContextProps> = ({ children }) => {
    const network = WalletAdapterNetwork.Mainnet;
    const endpoint = useMemo(() => SOL_NETWORK, []);
    const isMobile = useIsMobile();
    const [wallets, setWallets] = useState<WalletAdapter[]>([]);

    useEffect(() => {
        const loadWallets = async () => {
            if (!isMobile) return setWallets([]);
            try {
                const { WalletConnectWalletAdapter } = await import('@solana/wallet-adapter-walletconnect');
                const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bobys.world';
                setWallets([new WalletConnectWalletAdapter({
                    network, 
                    options: {
                        projectId: 'dfb2352907cc6782c27d341779f26375',
                        metadata: {
                            name: 'Bobys World', description: "Boby's World Game",
                            url: appUrl, icons: [`${appUrl}/Boby-logo.png`]
                        }
                    }
                })]);
            } catch (error) {
                logger.warn("Failed to load WalletConnect adapter:", error);
                setWallets([]);
            }
        };
        loadWallets();
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
