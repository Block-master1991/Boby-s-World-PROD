import { BOBY_TOKEN_MINT_ADDRESS, SOL_TOKEN_MINT_ADDRESS } from '@/lib/constants';
import { NextResponse, type NextRequest } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import axios, { type AxiosError } from 'axios';

interface JupiterPriceDataItem {
  id: string;
  mintSymbol?: string;
  vsToken?: string;
  vsTokenSymbol?: string;
  price: string | number; // Price can be string or number from Jupiter
}

interface JupiterPriceResponse {
  data: {
    [key: string]: JupiterPriceDataItem;
  };
  timeTaken: number;
}

let cachedPriceData: { price: number; timestamp: number } | null = null;
const CACHE_DURATION_MS = 3 * 1000; // 3 seconds cache for the API response

export async function GET(request: NextRequest) {
  console.log(`[boby-price-jup] Received request for Boby price from Jupiter API. Request URL: ${request.url}`);

  if (cachedPriceData && (Date.now() - cachedPriceData.timestamp < CACHE_DURATION_MS)) {
    console.log(`[boby-price-jup] Returning cached Boby price from Jupiter. Timestamp: ${new Date(cachedPriceData.timestamp).toISOString()}`);
    return NextResponse.json({ price: cachedPriceData.price, source: 'jupiter-cache' });
  }

  const apiUrl = `https://lite-api.jup.ag/price/v2?ids=${BOBY_TOKEN_MINT_ADDRESS},${SOL_TOKEN_MINT_ADDRESS}`;
  
  try {
    console.log(`[boby-price-jup] Attempting to fetch fresh Boby price from Jupiter API using axios: ${apiUrl}`);
    
    const jupiterAxiosResponse = await axios.get<JupiterPriceResponse>(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
      timeout: 10000 // Optional: 10 second timeout
    });

    const parsedData = jupiterAxiosResponse.data;
    console.log("[boby-price-jup] Parsed Jupiter API response (axios):", JSON.stringify(parsedData, null, 2).substring(0, 500) + "...");

    const bobyPriceData = parsedData.data?.[BOBY_TOKEN_MINT_ADDRESS];

    if (bobyPriceData && (typeof bobyPriceData.price === 'string' || typeof bobyPriceData.price === 'number')) {
      const priceStringOrNumber = bobyPriceData.price;
      const currentPrice = typeof priceStringOrNumber === 'string' ? parseFloat(priceStringOrNumber) : priceStringOrNumber;

      if (typeof currentPrice === 'number' && !isNaN(currentPrice)) {
        cachedPriceData = { price: currentPrice, timestamp: Date.now() };
        console.log(`[boby-price-jup] Fetched and cached new Boby price from Jupiter: ${currentPrice} at ${new Date(cachedPriceData.timestamp).toISOString()}`);

        // تهيئة Firebase Admin SDK
        await initializeAdminApp();
        const adminDb = getFirestore();

        console.log(`[boby-price-jup] Attempting to save price to collection 'bobyJupiterPriceHistory' using Firebase Admin SDK.`);
        try {
            const priceLogRef = adminDb.collection("bobyJupiterPriceHistory");
            await priceLogRef.add({
                mintAddress: BOBY_TOKEN_MINT_ADDRESS,
                price: currentPrice,
                source: 'jupiter_v2_lite_api_axios_multi_id_fetch_v3',
                fetchedAt: FieldValue.serverTimestamp()
            });
            console.log('[boby-price-jup] Successfully saved Jupiter price to Firestore using Admin SDK.');
        } catch (dbError: any) {
            console.error('[boby-price-jup] Error during Firestore save operation for Jupiter price (Admin SDK):', dbError);
            console.error(`[boby-price-jup] Firestore save error Name: ${dbError.name}, Message: ${dbError.message}, Code: ${dbError.code}`);
            if (dbError.stack) { console.error(`[boby-price-jup] Firestore save error Stack: ${dbError.stack}`); }
        }
        return NextResponse.json({ price: currentPrice, source: 'jupiter-api-axios' });
      } else {
        const originalPriceValue = bobyPriceData?.price;
        const priceType = typeof originalPriceValue;
        console.warn(`[boby-price-jup] Boby price data from Jupiter API was not a valid number after parsing (axios). Original value: "${originalPriceValue}" (type: ${priceType}). Parsed data structure:`, JSON.stringify(parsedData.data?.[BOBY_TOKEN_MINT_ADDRESS], null, 2).substring(0, 500) + "...");
        return NextResponse.json({
          error: `Boby price field type error from Jupiter. Price was: "${originalPriceValue}" (type: ${priceType}). Expected string or number.`,
          details: `The price field for ${BOBY_TOKEN_MINT_ADDRESS} from Jupiter API was present but could not be converted to a valid number.`,
          statusCode: 422 // Unprocessable Entity
        }, { status: 422 });
      }
    } else {
      console.warn(`[boby-price-jup] Boby token data (${BOBY_TOKEN_MINT_ADDRESS}) not found in Jupiter API response (axios) or price field missing. Parsed data:`, JSON.stringify(parsedData, null, 2).substring(0, 500) + "...");
      let hint = `Boby token data for mint address ${BOBY_TOKEN_MINT_ADDRESS} was not found in the 'data' object of the Jupiter API response.`;
      if (parsedData.data && BOBY_TOKEN_MINT_ADDRESS in parsedData.data && parsedData.data[BOBY_TOKEN_MINT_ADDRESS] && !('price' in parsedData.data[BOBY_TOKEN_MINT_ADDRESS])) {
        hint = `Boby token data for ${BOBY_TOKEN_MINT_ADDRESS} was found, but the 'price' field is missing. Available keys: ${Object.keys(parsedData.data[BOBY_TOKEN_MINT_ADDRESS]).join(', ')}.`;
      } else if (!parsedData.data) {
        hint = "The 'data' field itself was missing or null in the Jupiter API response."
      }
      
      return NextResponse.json({
        error: `Boby token data (${BOBY_TOKEN_MINT_ADDRESS.substring(0,7)}...) not found in API response.`,
        details: hint,
        statusCode: 404 // Not Found
      }, { status: 404 });
    }

  } catch (error: any) {
    console.error('[boby-price-jup] Error fetching from Jupiter API using axios:', error.isAxiosError ? error.toJSON() : error);
    let errorMessage = 'Internal server error while fetching from Jupiter (axios).';
    let errorDetails = 'Fetch to Jupiter API failed (axios).';
    let statusCode = 500;
    let errorCause = null;

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      errorMessage = `Jupiter API request failed (axios): ${axiosError.message}`;
      if (axiosError.response) {
        statusCode = axiosError.response.status;
        errorDetails = `Server responded with status ${statusCode}. Data: ${JSON.stringify(axiosError.response.data).substring(0, 200)}`;
        console.error(`[boby-price-jup] Jupiter API Error (axios): Status ${statusCode}, Data:`, axiosError.response.data);
      } else if (axiosError.request) {
        errorDetails = 'No response received from Jupiter API (axios). Check network connectivity.';
        console.error('[boby-price-jup] Jupiter API No Response (axios):', axiosError.request);
        statusCode = 504; 
      } else {
        errorDetails = `Error setting up Jupiter API request (axios): ${axiosError.message}`;
      }
      if(axiosError.cause) errorCause = (axiosError.cause as Error).message;

    } else {
      if (error.message) errorDetails = error.message;
      if (error.cause) errorCause = typeof error.cause === 'string' ? { message: error.cause } : error.cause;
    }
    
    return NextResponse.json({
        error: errorMessage,
        details: errorDetails,
        cause: errorCause,
        statusCode: statusCode
    }, { status: statusCode });
  }
}

export const dynamic = 'force-dynamic';

