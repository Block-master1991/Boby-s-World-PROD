
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

const BobyPriceDisplay: React.FC = () => {
    const [price, setPrice] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorInfo, setErrorInfo] = useState<{ message: string, details?: string, cause?: any, status?: number } | null>(null);

    const fetchPrice = useCallback(async (isInitialLoad = false) => {
        if (!isInitialLoad) {
            setIsLoading(true);
        }
        setErrorInfo(null);
        try {
            const response = await fetch('/api/boby-price-jup');

            if (!response.ok) {
                let errorFromServer = 'Failed to fetch price from API route.';
                let rawErrorDetails = `API route responded with HTTP ${response.status} ${response.statusText || '(No status text)'}`;
                let cause = null;
                let responseStatus = response.status;

                try {
                    const errorData = await response.json();
                    errorFromServer = errorData.error || errorFromServer;
                    rawErrorDetails = errorData.details || rawErrorDetails;
                    cause = errorData.cause || null;
                    responseStatus = errorData.statusCode || response.status;

                    if (responseStatus === 429) {
                        errorFromServer = "Rate limit exceeded with price API.";
                        rawErrorDetails = errorData.details || "Too many requests. Please try again later.";
                    }

                } catch (jsonError) {
                    rawErrorDetails = `${response.statusText || 'Server did not return a valid JSON error response.'}`;
                     if (response.status === 429) {
                        errorFromServer = "Rate limit exceeded with price API.";
                        rawErrorDetails = "Too many requests. Please try again later.";
                    }
                }

                const fullErrorLog = `API route error: Status ${responseStatus}. Message: "${errorFromServer}". Details: "${rawErrorDetails}" ${cause ? `Cause: ${JSON.stringify(cause)}` : ''}`;
                console.warn(`[BobyPriceDisplay] ${fullErrorLog}`);

                setErrorInfo({ message: errorFromServer, details: rawErrorDetails, cause, status: responseStatus });
                setPrice(null);
                return; 
            }

            const data = await response.json();

            if (typeof data.price === 'number') {
                setPrice(data.price);
            } else {
                const msg = data.error || 'Price data unavailable or in unexpected format from API route.';
                console.warn("[BobyPriceDisplay] Price data not found or invalid format in API route response. Response:", data);
                setErrorInfo({ message: msg, details: 'API route did not return a valid price number.' });
                setPrice(null);
            }
        } catch (e: any) {
            console.error("[BobyPriceDisplay] Error fetching/processing Boby token price:", e);
            setErrorInfo({ message: e.message || 'A client-side error occurred while fetching price.', details: String(e) });
            setPrice(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPrice(true); // Initial load
        const intervalId = setInterval(() => fetchPrice(false), 5000); // Refresh every 5 seconds
        return () => clearInterval(intervalId);
    }, [fetchPrice]);


    let displayErrorMessage = 'Could not fetch price.';
    if (errorInfo) {
        if (errorInfo.status === 429) {
            displayErrorMessage = "Rate limit exceeded. Please try again later.";
        } else if (errorInfo.cause && (errorInfo.cause as any).code === 'ENOTFOUND') {
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
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {!isLoading && errorInfo && (
                        <div className="flex items-center text-destructive text-xs" title={errorInfo.details || displayErrorMessage}>
                            <AlertCircle className="h-4 w-4 mr-1 rtl:ml-1 flex-shrink-0" />
                            <span className="hidden sm:inline truncate" style={{maxWidth: '100px'}}>{displayErrorMessage}</span>
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
                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
                        <span className="sr-only">Refresh Price</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default BobyPriceDisplay;
