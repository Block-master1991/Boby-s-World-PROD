
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, PawPrint, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useMarketData } from '@/hooks/useGraphQL';

const BobyPriceDisplay: React.FC = () => {
    // Maintain same variable names and structure
    const [price, setPrice] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorInfo, setErrorInfo] = useState<{ message: string, details?: string, cause?: unknown, status?: number } | null>(null);

    // Use GraphQL hook instead of REST API (same functionality)
    const { data: marketData, loading: graphqlLoading, error: graphqlError, execute: refreshPrice } = useMarketData();

    // Extract price maintaining same logic
    const currentPrice = marketData?.marketData?.bobyPrice || null;

    // Update state when GraphQL data changes (same effect as fetchPrice)
    useEffect(() => {
        setIsLoading(graphqlLoading);
        if (graphqlError) {
            setErrorInfo({
                message: graphqlError,
                details: 'Failed to fetch price via GraphQL'
            });
            setPrice(null);
        } else if (currentPrice !== null) {
            setPrice(currentPrice);
            setErrorInfo(null);
        }
    }, [currentPrice, graphqlLoading, graphqlError]);

    // Maintain same fetchPrice function interface for refresh button
    const fetchPrice = useCallback(async (isInitialLoad = false) => {
        if (!isInitialLoad) {
            setIsLoading(true);
        }
        setErrorInfo(null);

        try {
            // Use GraphQL refresh function (same functionality)
            await refreshPrice();
        } catch (e: unknown) {
            console.error("[BobyPriceDisplay] Error refreshing price:", e);
            setErrorInfo({
                message: (e instanceof Error) ? e.message : 'Failed to refresh price',
                details: 'GraphQL refresh failed'
            });
            setPrice(null);
            setIsLoading(false);
        }
    }, [refreshPrice]);

    // Maintain same auto-refresh logic (5 seconds interval)
    useEffect(() => {
        // Initial load happens automatically via useMarketData hook
        const intervalId = setInterval(() => fetchPrice(false), 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId);
    }, [fetchPrice]);


    let displayErrorMessage = 'Could not fetch price.';
    if (errorInfo) {
        if (errorInfo.status === 429) {
            displayErrorMessage = "Rate limit exceeded. Please try again later.";
        } else if (errorInfo.cause && typeof errorInfo.cause === 'object' && 'code' in errorInfo.cause && errorInfo.cause.code === 'ENOTFOUND') {
            displayErrorMessage = "Network error: Price service unreachable.";
        } else if (errorInfo.status === 404 && (errorInfo.message.includes("Price data unavailable") || (errorInfo.details && errorInfo.details.includes("Price data unavailable")) || errorInfo.message.includes("API"))) {
            displayErrorMessage = "Price data currently unavailable.";
        } else if (errorInfo.message.includes("Failed to fetch price from API") || (errorInfo.details && errorInfo.details.includes("API"))) {
            displayErrorMessage = "Price service returned an error.";
        } else if (errorInfo.message.includes("not found in API response") || (errorInfo.details && errorInfo.details.includes("not found in API response"))) {
            displayErrorMessage = "BOBY token not found in response.";
        }
        else {
            displayErrorMessage = errorInfo.message;
        }
    }

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
                        <div className="flex items-center text-destructive text-xs" title={errorInfo.details || displayErrorMessage}>
                            <AlertCircle className="h-4 w-4 mr-1 rtl:ml-1 flex-shrink-0" />
                            <span className="hidden sm:inline truncate" style={{ maxWidth: '100px' }}>{displayErrorMessage}</span>
                            <span className="sm:hidden">Error</span>
                        </div>
                    )}
                    {!isLoading && !errorInfo && price !== null && (
                        <span className="font-semibold text-primary tabular-nums">
                            ${price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
                        </span>
                    )}
                    {!isLoading && !errorInfo && price === null && !errorInfo && (
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
