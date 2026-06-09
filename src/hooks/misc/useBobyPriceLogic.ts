"use client";

import { useBobyPriceUpdates, useMarketData } from "@/hooks/useGraphQL";
import { useCallback, useEffect, useState } from "react";

export interface ErrorInfo {
  message: string;
  details?: string;
  status?: number;
}

export const useBobyPriceLogic = () => {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const {
    data: marketData,
    loading: graphqlLoading,
    error: graphqlError,
    execute: refreshPrice,
  } = useMarketData();
  const { data: priceUpdates, error: subscriptionError } = useBobyPriceUpdates();
  const currentPrice = marketData?.marketData?.bobyPrice || null;

  useEffect(() => {
    if (priceUpdates) {
      setPrice(priceUpdates.price);
      setErrorInfo(null);
    }
  }, [priceUpdates]);

  useEffect(() => {
    setIsLoading(graphqlLoading);
    if (graphqlError || subscriptionError) {
      setErrorInfo({
        message: graphqlError || subscriptionError || "Failed to fetch price",
        details: "Failed to fetch price via GraphQL",
      });
      setPrice(null);
    } else if (currentPrice !== null && !priceUpdates) {
      setPrice(currentPrice);
      setErrorInfo(null);
    }
  }, [currentPrice, graphqlLoading, graphqlError, subscriptionError, priceUpdates]);

  const fetchPrice = useCallback(
    async (isInitialLoad = false) => {
      if (!isInitialLoad) setIsLoading(true);
      setErrorInfo(null);
      try {
        await refreshPrice();
      } catch (e: unknown) {
        setErrorInfo({
          message: e instanceof Error ? e.message : "Failed to refresh price",
          details: "GraphQL refresh failed",
        });
        setPrice(null);
        setIsLoading(false);
      }
    },
    [refreshPrice]
  );

  useEffect(() => {
    const i = setInterval(() => fetchPrice(false), 5000);
    return () => clearInterval(i);
  }, [fetchPrice]);

  return { price, isLoading, errorInfo, fetchPrice };
};

export const getDisplayErrorMessage = (errorInfo: ErrorInfo | null) => {
  if (!errorInfo) return "Could not fetch price.";

  const { status, message, details } = errorInfo;
  const combinedMsg = `${message} ${details || ""}`;

  if (status === 429) return "Rate limit exceeded. Please try again later.";
  if (combinedMsg.includes("Price data unavailable") || combinedMsg.includes("API")) {
    return "Price data currently unavailable.";
  }
  if (combinedMsg.includes("not found in API response")) {
    return "BOBY token not found in response.";
  }

  return message;
};
