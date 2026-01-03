import axios, { type AxiosError } from 'axios';
import { BOBY_TOKEN_MINT_ADDRESS, JUPITER_API_KEY, SOL_TOKEN_MINT_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';

// 1. Create a custom axios instance
// This allows us to set basic configurations for use in all requests
const jupiterApiClient = axios.create({
  baseURL: 'https://api.jup.ag',
  timeout: 10000, // 10 seconds as timeout for the request
  headers: {
    'Accept': 'application/json',
    'x-api-key': JUPITER_API_KEY, // <-- Add API key here
  }
});

// 2. Define type interfaces for Jupiter API response
// This makes data handling safer and clearer
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
  // Allow direct access to data
  [key: string]: any;
}

/**
 * Professional function to fetch BOBY token price from Jupiter API
 * @returns {Promise<number>} - Token price
 * @throws {Error} - In case of failure to fetch price or non-existence
 */
export async function getBobyPrice(): Promise<number> {
  const endpoint = `/price/v3?ids=${BOBY_TOKEN_MINT_ADDRESS},${SOL_TOKEN_MINT_ADDRESS}`;
  logger.log(`[jupiterClient] Fetching Boby price from: ${endpoint}`);

  try {
    // 3. Use custom axios instance to make the request
    const response = await jupiterApiClient.get<JupiterPriceResponse>(endpoint);

    // 4. Process received data
    // Extract data from the response
    const responseData = response.data as any;

    // Verify data existence
    if (!responseData || typeof responseData !== 'object') {
      logger.error('[jupiterClient] Invalid response structure:', response.data);
      throw new Error('Invalid response structure from Jupiter API.');
    }

    // Search for Boby token data
    let bobyData = null;

    // First method: use direct key
    if (responseData[BOBY_TOKEN_MINT_ADDRESS] && typeof responseData[BOBY_TOKEN_MINT_ADDRESS].usdPrice === 'number') {
      bobyData = responseData[BOBY_TOKEN_MINT_ADDRESS];
    }
    // Second method: search in data object
    else if (responseData.data && responseData.data[BOBY_TOKEN_MINT_ADDRESS] && typeof responseData.data[BOBY_TOKEN_MINT_ADDRESS].usdPrice === 'number') {
      bobyData = responseData.data[BOBY_TOKEN_MINT_ADDRESS];
    }

    if (bobyData) {
      logger.log(`[jupiterClient] Successfully fetched Boby price: ${bobyData.usdPrice}`);
      return bobyData.usdPrice;
    } else {
      logger.error('[jupiterClient] Boby token data or usdPrice not found in Jupiter response:', response.data);
      throw new Error('Invalid response structure from Jupiter API.');
    }
  } catch (error) {
    // 5. Handle errors professionally
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      logger.error(`[jupiterClient] Axios error fetching price: ${axiosError.message}`);
      if (axiosError.response) {
        logger.error(`[jupiterClient] Status: ${axiosError.response.status}, Data:`, axiosError.response.data);
      }
    } else {
      logger.error('[jupiterClient] An unexpected error occurred:', error);
    }
    // Throw new error so caller can handle it
    throw new Error('Failed to fetch price from Jupiter API.');
  }
}
