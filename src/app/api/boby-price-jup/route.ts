import { BOBY_TOKEN_MINT_ADDRESS } from '@/lib/constants';
import { logger } from '@/utils/logger';
import { NextResponse, type NextRequest } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getBobyPrice } from '@/lib/jupiterClient'; // <-- 1. Import the professional function

let cachedPriceData: { price: number; timestamp: number } | null = null;
const CACHE_DURATION_MS = 3 * 1000; // 3 seconds cache for the API response

export async function GET(request: NextRequest) {
  logger.log(`[boby-price-jup] Received request for Boby price. URL: ${request.url}`);

  // Use cached price if valid
  if (cachedPriceData && (Date.now() - cachedPriceData.timestamp < CACHE_DURATION_MS)) {
    logger.log(`[boby-price-jup] Returning cached Boby price. Timestamp: ${new Date(cachedPriceData.timestamp).toISOString()}`);
    return NextResponse.json({ price: cachedPriceData.price, source: 'cache' });
  }

  try {
    // 2. Call the custom function to fetch price
    logger.log(`[boby-price-jup] Attempting to fetch fresh Boby price using jupiterClient.`);
    const currentPrice = await getBobyPrice();

    // 3. Cache the price temporarily and record in Firestore
    cachedPriceData = { price: currentPrice, timestamp: Date.now() };
    logger.log(`[boby-price-jup] Fetched and cached new Boby price: ${currentPrice} at ${new Date(cachedPriceData.timestamp).toISOString()}`);

    try {
      await initializeAdminApp();
      const adminDb = getFirestore();
      const priceLogRef = adminDb.collection("bobyJupiterPriceHistory");
      await priceLogRef.add({
        mintAddress: BOBY_TOKEN_MINT_ADDRESS,
        price: currentPrice,
        source: 'jupiter_v3_axios_client',
        fetchedAt: FieldValue.serverTimestamp()
      });
      logger.log('[boby-price-jup] Successfully saved Jupiter price to Firestore.');
    } catch (dbError) {
      logger.error('[boby-price-jup] Error saving price to Firestore:', dbError as Error);
      // Don't stop the process due to logging error, but record it
    }

    // 4. Return successful response
    return NextResponse.json({ price: currentPrice, source: 'jupiter-api-axios-client' });

  } catch (error) {
    // 5. Handle errors that may occur during price fetching
    logger.error('[boby-price-jup] Error fetching from jupiterClient:', error as Error);

    return NextResponse.json({
      error: 'Failed to fetch price from Jupiter API',
      details: error instanceof Error ? error.message : 'An unknown error occurred.',
      statusCode: 500
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
