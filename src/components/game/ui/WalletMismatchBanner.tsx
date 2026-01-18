'use client';

import { AlertCircle } from 'lucide-react';
import React from 'react';

export const WalletMismatchBanner: React.FC = () => (
    <div className="absolute top-[calc(1.5rem+var(--sat))] left-1/2 -translate-x-1/2 z-50 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg shadow-lg flex items-center animate-pulse">
        <AlertCircle className="h-5 w-5 mr-2 rtl:ml-2" />
        <span>Wallet Mismatch! Align wallet in extension or reconnect. Actions paused.</span>
    </div>
);
