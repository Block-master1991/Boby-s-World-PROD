'use client';

import { Button } from '@/components/ui/button';
import { getDisplayErrorMessage, useBobyPriceLogic } from '@/hooks/useBobyPriceLogic';
import { PawPrint, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import React from 'react';
import { ErrorView, PriceView } from './BobyPriceDisplayComponents';

const BobyPriceDisplay: React.FC = () => {
    const { price, isLoading, errorInfo, fetchPrice } = useBobyPriceLogic();
    const displayErrorMessage = getDisplayErrorMessage(errorInfo);

    return (
        <div className="p-2.5 mb-3 rounded-md bg-card/60 border border-border/70 shadow-sm">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <Image src="/Boby-logo.png" alt="Boby Token" width={24} height={24} className="rounded-none" data-ai-hint="dog logo" priority />
                    <span className="font-medium text-foreground">Boby Price:</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {isLoading && <PawPrint className="h-4 w-4 animate-pulse text-primary" />}
                    {!isLoading && errorInfo && (
                        <ErrorView message={displayErrorMessage} details={errorInfo.details} />
                    )}
                    {!isLoading && !errorInfo && price !== null && (
                        <PriceView price={price} />
                    )}
                    {!isLoading && !errorInfo && price === null && (
                        <span className="text-xs text-muted-foreground">Unavailable</span>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => fetchPrice(false)} className="h-6 w-6 text-muted-foreground hover:text-primary" title="Refresh Price">
                        {isLoading ? <PawPrint className="h-3.5 w-3.5 animate-pulse" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        <span className="sr-only">Refresh Price</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default BobyPriceDisplay;
