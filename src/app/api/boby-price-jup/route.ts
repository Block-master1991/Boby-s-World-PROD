import { BOBY_TOKEN_MINT_ADDRESS } from '@/lib/constants';
import { NextResponse, type NextRequest } from 'next/server';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getBobyPrice } from '@/lib/jupiterClient'; // <-- 1. استيراد الدالة الاحترافية

let cachedPriceData: { price: number; timestamp: number } | null = null;
const CACHE_DURATION_MS = 3 * 1000; // 3 seconds cache for the API response

export async function GET(request: NextRequest) {
  console.log(`[boby-price-jup] Received request for Boby price. URL: ${request.url}`);

  // استخدام السعر المخزن مؤقتاً إذا كان صالحًا
  if (cachedPriceData && (Date.now() - cachedPriceData.timestamp < CACHE_DURATION_MS)) {
    console.log(`[boby-price-jup] Returning cached Boby price. Timestamp: ${new Date(cachedPriceData.timestamp).toISOString()}`);
    return NextResponse.json({ price: cachedPriceData.price, source: 'cache' });
  }
      
  try {
    // 2. استدعاء الدالة المخصصة لجلب السعر
    console.log(`[boby-price-jup] Attempting to fetch fresh Boby price using jupiterClient.`);
    const currentPrice = await getBobyPrice();

    // 3. تخزين السعر مؤقتاً وتسجيله في Firestore
    cachedPriceData = { price: currentPrice, timestamp: Date.now() };
    console.log(`[boby-price-jup] Fetched and cached new Boby price: ${currentPrice} at ${new Date(cachedPriceData.timestamp).toISOString()}`);

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
      console.log('[boby-price-jup] Successfully saved Jupiter price to Firestore.');
    } catch (dbError) {
      console.error('[boby-price-jup] Error saving price to Firestore:', dbError);
      // لا نوقف العملية بسبب خطأ في التسجيل، لكن نسجله
    }

    // 4. إرجاع الاستجابة بنجاح
    return NextResponse.json({ price: currentPrice, source: 'jupiter-api-axios-client' });

  } catch (error) {
    // 5. معالجة الأخطاء التي قد تحدث أثناء جلب السعر
    console.error('[boby-price-jup] Error fetching from jupiterClient:', error);
    
    return NextResponse.json({
        error: 'Failed to fetch price from Jupiter API',
        details: error instanceof Error ? error.message : 'An unknown error occurred.',
        statusCode: 500
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
