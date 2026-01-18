'use client';

import { AlertCircle } from 'lucide-react';
import React from 'react';

interface PriceViewProps {
    price: number;
}

export const PriceView: React.FC<PriceViewProps> = ({ price }) => (
    <span className="font-semibold text-primary tabular-nums">
        ${price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
    </span>
);

interface ErrorViewProps {
    message: string;
    details?: string | undefined;
}

export const ErrorView: React.FC<ErrorViewProps> = ({ message, details }) => (
    <div className="flex items-center text-destructive text-xs" title={details || message}>
        <AlertCircle className="h-4 w-4 mr-1 rtl:ml-1 flex-shrink-0" />
        <span className="hidden sm:inline truncate" style={{ maxWidth: '100px' }}>{message}</span>
        <span className="sm:hidden">Error</span>
    </div>
);
