
'use client';

import type { FC, ReactNode } from 'react';
import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import {
    createDefaultAuthorizationCache,
    createDefaultChainSelector,
    createDefaultWalletNotFoundHandler,
    registerMwa,
} from '@solana-mobile/wallet-standard-mobile';

import {
    PhantomWalletAdapter,
} from '@solana/wallet-adapter-phantom';

import {
    SolflareWalletAdapter,
} from '@solana/wallet-adapter-solflare';

import { SOL_NETWORK, DEDICATED_RPC_ENDPOINT } from '@/lib/constants';

// ✅ تسجيل الـ MWA خارج React
if (typeof window !== 'undefined') {
registerMwa({
    appIdentity: {
        name: 'Bobys World',
        uri: 'https://divine-bedbug-valued.ngrok-free.app', // تأكد من تحديث هذا الرابط إلى رابط التطبيق الخاص بك
        icon: '/Boby-logo.png', // تأكد أن هذا المسار صحيح ويشير إلى ملف داخل public
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:devnet', 'solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
    remoteHostAuthority: 'divine-bedbug-valued.ngrok-free.app', // ✅ هذا مهم لتشغيل خيار الاتصال عن بُعد
});
}

interface WalletContextProps {
    children: ReactNode;
}

const WalletContextProvider: FC<WalletContextProps> = ({ children }) => {
    const network = WalletAdapterNetwork.Mainnet; 
    
    const endpoint = useMemo(() => {
        if (DEDICATED_RPC_ENDPOINT && DEDICATED_RPC_ENDPOINT !== 'YOUR_DEDICATED_RPC_ENDPOINT_HERE' && DEDICATED_RPC_ENDPOINT.startsWith('https://')) {
            return DEDICATED_RPC_ENDPOINT;
        }
        return SOL_NETWORK;
    }, []);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter({
            }),
            // Wallets are automatically discovered via the Wallet Standard
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletContextProvider;
