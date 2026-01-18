import { logger } from '@/utils/logger';

interface MarketData {
  bobyPrice: number;
  volume24h: number;
  priceChange24h: number;
  lastUpdated: string;
}

export class MarketService {
  private static cache: MarketData | null = null;
  private static lastFetch = 0;
  private static readonly TTL = 30000; // 30 seconds

  static async getMarketData(requestHost?: string): Promise<MarketData> {
    const now = Date.now();
    
    // Check cache
    if (this.cache && (now - this.lastFetch < this.TTL)) {
      return this.cache;
    }

    try {
      const baseUrl = requestHost ? `http://${requestHost}` : 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/boby-price-jup`, { method: 'GET' });
      
      if (!response.ok) throw new Error('Jupiter API failure');
      const data = await response.json();

      this.cache = {
        bobyPrice: data.price,
        volume24h: 0,
        priceChange24h: 0,
        lastUpdated: new Date().toISOString(),
      };
      this.lastFetch = now;

      return this.cache;
    } catch (error) {
      logger.error('[MarketService] Error:', error);
      
      // Return stale cache if available, otherwise fallback
      if (this.cache) return this.cache;

      return {
        bobyPrice: 0.00001234,
        volume24h: 0,
        priceChange24h: 0,
        lastUpdated: new Date().toISOString(),
      };
    }
  }
}
