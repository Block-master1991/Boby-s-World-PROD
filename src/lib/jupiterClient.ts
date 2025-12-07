import axios, { type AxiosError } from 'axios';
import { BOBY_TOKEN_MINT_ADDRESS, JUPITER_API_KEY, SOL_TOKEN_MINT_ADDRESS } from '@/lib/constants';

// 1. إنشاء نسخة مخصصة من axios (axios instance)
// هذا يسمح لنا بضبط إعدادات أساسية لاستخدامها في كل الطلبات
const jupiterApiClient = axios.create({
  baseURL: 'https://api.jup.ag',
  timeout: 10000, // 10 ثوانٍ كمهلة للطلب
  headers: {
    'Accept': 'application/json',
    'x-api-key': JUPITER_API_KEY, // <-- إضافة مفتاح API هنا
  }
});

// 2. تعريف واجهات الأنواع (Interfaces) لاستجابة Jupiter API
// هذا يجعل التعامل مع البيانات أكثر أمانًا ووضوحًا
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
  // السماح بالوصول المباشر للبيانات
  [key: string]: any;
}

/**
 * دالة احترافية لجلب سعر توكن BOBY من Jupiter API
 * @returns {Promise<number>} - سعر التوكن
 * @throws {Error} - في حالة فشل جلب السعر أو عدم وجوده
 */
export async function getBobyPrice(): Promise<number> {
  const endpoint = `/price/v3?ids=${BOBY_TOKEN_MINT_ADDRESS},${SOL_TOKEN_MINT_ADDRESS}`;
  console.log(`[jupiterClient] Fetching Boby price from: ${endpoint}`);

  try {
    // 3. استخدام نسخة axios المخصصة لإجراء الطلب
    const response = await jupiterApiClient.get<JupiterPriceResponse>(endpoint);

    // 4. معالجة البيانات المستلمة
    // استخراج البيانات من الاستجابة
    const responseData = response.data as any;

    // التحقق من وجود البيانات
    if (!responseData || typeof responseData !== 'object') {
      console.error('[jupiterClient] Invalid response structure:', response.data);
      throw new Error('Invalid response structure from Jupiter API.');
    }

    // البحث عن بيانات Boby token
    let bobyData = null;

    // الطريقة الأولى: استخدام المفتاح المباشر
    if (responseData[BOBY_TOKEN_MINT_ADDRESS] && typeof responseData[BOBY_TOKEN_MINT_ADDRESS].usdPrice === 'number') {
      bobyData = responseData[BOBY_TOKEN_MINT_ADDRESS];
    }
    // الطريقة الثانية: البحث في كائن data
    else if (responseData.data && responseData.data[BOBY_TOKEN_MINT_ADDRESS] && typeof responseData.data[BOBY_TOKEN_MINT_ADDRESS].usdPrice === 'number') {
      bobyData = responseData.data[BOBY_TOKEN_MINT_ADDRESS];
    }

    if (bobyData) {
      console.log(`[jupiterClient] Successfully fetched Boby price: ${bobyData.usdPrice}`);
      return bobyData.usdPrice;
    } else {
      console.error('[jupiterClient] Boby token data or usdPrice not found in Jupiter response:', response.data);
      throw new Error('Invalid response structure from Jupiter API.');
    }
  } catch (error) {
    // 5. معالجة الأخطاء بطريقة احترافية
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`[jupiterClient] Axios error fetching price: ${axiosError.message}`);
      if (axiosError.response) {
        console.error(`[jupiterClient] Status: ${axiosError.response.status}, Data:`, axiosError.response.data);
      }
    } else {
      console.error('[jupiterClient] An unexpected error occurred:', error);
    }
    // رمي خطأ جديد لكي يتمكن المستدعي من معالجته
    throw new Error('Failed to fetch price from Jupiter API.');
  }
}
