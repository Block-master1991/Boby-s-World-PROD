'use client';

import type { StoreItemDefinition } from '@/lib/items';
import { Droplet, Target } from 'lucide-react';
import Image from 'next/image';
import React from 'react';

interface StatsOverlayProps {
    sessionCollectedUSDT: number;
    remainingCoinsOnMap: number;
    COIN_COUNT: number;
    protectionBottleCount: number;
    protectionBottleDef?: StoreItemDefinition | undefined;
    isWalletMismatch: boolean;
}

export const StatsOverlay: React.FC<StatsOverlayProps> = ({
    sessionCollectedUSDT,
    remainingCoinsOnMap,
    COIN_COUNT,
    protectionBottleCount,
    protectionBottleDef,
    isWalletMismatch
}) => {
    const ProtectionBottleIcon = protectionBottleDef?.icon || Droplet;

    return (
        <div className={`absolute top-[calc(1rem+var(--sat))] left-1/2 -translate-x-1/2 z-20 bg-primary/80 text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex flex-col md:flex-row items-center md:justify-center space-y-1 md:space-y-0 md:space-x-4 ${isWalletMismatch ? 'mt-12' : ''}`}>
            <div className="flex items-center">
                <Image src="/USDT-logo.png" alt="USDT Icon" width={20} height={20} className="h-5 w-5 mr-2 rtl:ml-2" />
                <span>{sessionCollectedUSDT.toFixed(4)} USDT</span>
            </div>
            <div className="flex items-center text-xs opacity-90">
                <Target className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
                <span>Coins: {remainingCoinsOnMap} / {COIN_COUNT}</span>
            </div>
            {protectionBottleDef && (
                <div className="flex items-center text-xs opacity-90">
                    <ProtectionBottleIcon className="h-4 w-4 mr-1.5 rtl:ml-1.5" />
                    <span>Bottles: {protectionBottleCount}</span>
                </div>
            )}
        </div>
    );
};
