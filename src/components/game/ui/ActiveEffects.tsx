'use client';

import Image from 'next/image';
import React from 'react';

interface ActiveEffectsProps {
    isSpeedBoostActive: boolean;
    speedBoostTimeLeft: number;
    isShieldActive: boolean;
    shieldTimeLeft: number;
    isCoinMagnetActive: boolean;
    coinMagnetTimeLeft: number;
}

export const ActiveEffects: React.FC<ActiveEffectsProps> = ({
    isSpeedBoostActive,
    speedBoostTimeLeft,
    isShieldActive,
    shieldTimeLeft,
    isCoinMagnetActive,
    coinMagnetTimeLeft,
}) => (
    <div className="absolute top-[calc(4rem+var(--sat))] right-[calc(1rem+var(--sar))] z-20 flex flex-col space-y-2">
        {isSpeedBoostActive && speedBoostTimeLeft > 0 && (
            <div className="bg-yellow-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
                <Image src="/items/speedyPawsTreat.png" alt="Speed Boost" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({speedBoostTimeLeft}s)
            </div>
        )}
        {isShieldActive && shieldTimeLeft > 0 && (
            <div className="bg-blue-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
                <Image src="/items/guardianShield.png" alt="Guardian Shield" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({shieldTimeLeft}s)
            </div>
        )}
        {isCoinMagnetActive && coinMagnetTimeLeft > 0 && (
            <div className="bg-purple-500/80 text-white px-3 py-1.5 rounded-lg shadow-md text-sm font-medium animate-pulse flex items-center">
                <Image src="/items/coinMagnetTreat.png" alt="Coin Magnet" width={16} height={16} className="h-4 w-4 mr-1.5 rtl:ml-1.5" /> ({coinMagnetTimeLeft}s)
            </div>
        )}
    </div>
);
