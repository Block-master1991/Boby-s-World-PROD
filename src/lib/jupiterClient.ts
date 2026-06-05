import { BOBY_TOKEN_MINT_ADDRESS, JUPITER_API_KEY, SOL_TOKEN_MINT_ADDRESS } from "@/lib/constants";
import { logger } from "@/utils/logger";
import axios, { type AxiosError } from "axios";

const jupiterApiClient = axios.create({
  baseURL: "https://api.jup.ag",
  timeout: 10000,
  headers: {
    Accept: "application/json",
    "x-api-key": JUPITER_API_KEY,
  },
});

interface JupiterPriceData {
  id?: string;
  usdPrice: number;
  blockId?: number;
  decimals?: number;
  priceChange24h?: number;
}

interface JupiterPriceResponse {
  data?: {
    [key: string]: JupiterPriceData;
  };
  [key: string]: unknown;
}

function extractPriceFromResponse(responseData: JupiterPriceResponse): number | null {
  if (!responseData || typeof responseData !== "object") return null;

  // Check direct key
  const directData = responseData[BOBY_TOKEN_MINT_ADDRESS] as JupiterPriceData | undefined;
  if (directData?.usdPrice !== undefined) {
    return directData.usdPrice;
  }

  // Check in data object
  const nestedData = responseData.data?.[BOBY_TOKEN_MINT_ADDRESS];
  if (nestedData?.usdPrice !== undefined) {
    return nestedData.usdPrice;
  }

  return null;
}

export async function getBobyPrice(): Promise<number> {
  const endpoint = `/price/v3?ids=${BOBY_TOKEN_MINT_ADDRESS},${SOL_TOKEN_MINT_ADDRESS}`;
  logger.log(`[jupiterClient] Fetching Boby price from: ${endpoint}`);

  try {
    const response = await jupiterApiClient.get<JupiterPriceResponse>(endpoint);
    const price = extractPriceFromResponse(response.data);

    if (price !== null) {
      logger.log(`[jupiterClient] Successfully fetched Boby price: ${price}`);
      return price;
    }

    logger.error(
      "[jupiterClient] Boby token data or usdPrice not found in response:",
      response.data
    );
    throw new Error("Invalid response structure from Jupiter API.");
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      logger.error(`[jupiterClient] Axios error fetching price: ${axiosError.message}`);
      if (axiosError.response) {
        logger.error(
          `[jupiterClient] Status: ${axiosError.response.status}, Data:`,
          axiosError.response.data
        );
      }
    } else {
      logger.error("[jupiterClient] An unexpected error occurred:", error);
    }
    throw new Error("Failed to fetch price from Jupiter API.");
  }
}
