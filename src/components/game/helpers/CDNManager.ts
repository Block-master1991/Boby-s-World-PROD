import { logger } from "@/utils/logger";

import { CDN_CONFIG } from "@/lib/config/env";

/* eslint-disable @typescript-eslint/no-unused-vars */
export class CDNManager {
  public userRegion: string = "US";

  constructor() {
    this.detectUserRegion();
  }

  private async detectUserRegion() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      const matched = text.match(/loc=([A-Z]{2})/);
      if (matched) {
        const [, loc] = matched;
        if (loc) {
          this.userRegion = loc;
        }
      }
    } catch (error) {
      logger.log("[CDNManager] Could not detect user region, using fallback");
    }
  }

  getOptimalAssetUrl(assetPath: string): string {
    if (!CDN_CONFIG.enabled) return assetPath;
    return `${CDN_CONFIG.baseUrl}/${assetPath}`;
  }
}
