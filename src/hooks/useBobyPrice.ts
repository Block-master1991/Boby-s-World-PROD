'use client';

import { useMarketData } from '@/hooks/useGraphQL';
import { useEffect } from 'react';

/**
 * useBobyPrice - Custom hook to fetch and periodically refresh Boby token price
 */
export const useBobyPrice = () => {
    const { 
        data: marketData, 
        loading: isBobyPriceLoading, 
        error: bobyPriceError, 
        execute: fetchBobyUsdPrice 
    } = useMarketData();

    const bobyUsdPrice = marketData?.marketData?.bobyPrice || null;

    useEffect(() => {
        fetchBobyUsdPrice();
        const intervalId = setInterval(() => {
            fetchBobyUsdPrice();
        }, 30000);
        return () => clearInterval(intervalId);
    }, [fetchBobyUsdPrice]);

    return { bobyUsdPrice, isBobyPriceLoading, bobyPriceError, fetchBobyUsdPrice };
};
