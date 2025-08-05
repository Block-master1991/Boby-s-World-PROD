
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

import { SOL_NETWORK } from '@/lib/constants';

// ✅ تسجيل الـ MWA خارج React
if (typeof window !== 'undefined') {
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' || 'https://divine-bedbug-valued.ngrok-free.app'; // استخدام متغير بيئة أو افتراضي
const appHost = new URL(appUrl).host; // استخراج المضيف من URL

registerMwa({
    appIdentity: {
        name: 'Bobys World',
        uri: appUrl, // استخدام متغير البيئة
        icon: '/Boby-logo.png', // تأكد أن هذا المسار صحيح ويشير إلى ملف داخل public
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:devnet', 'solana:mainnet'],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
    remoteHostAuthority: appHost, // استخدام المضيف المستخرج من متغير البيئة
});
}

interface WalletContextProps {
    children: ReactNode;
}

const WalletContextProvider: FC<WalletContextProps> = ({ children }) => {
    const network = WalletAdapterNetwork.Mainnet; 
    
    const endpoint = useMemo(() => SOL_NETWORK, []);

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
            <WalletProvider wallets={wallets} autoConnect={true}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export default WalletContextProvider;
