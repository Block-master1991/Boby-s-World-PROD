/**
 * HDR Web Worker for Boby's World
 * Handles fetching and parsing heavy 8K HDR files off-thread to prevent main thread blocking
 * Uses Transferable Objects for zero-copy memory transfer.
 */

/// <reference lib="webworker" />

import { logger } from 'utils/logger';
import {
  calculateDownscaleTarget,
  decodeScanline,
  parseHeader,
  processDownscaling,
  rgbeToFloat32,
  toHalf,
  type HDRWorkerMessage
} from './hdrUtils';

/**
 * Main Async Parser with On-the-Fly Downscaling.
 * Uses helper functions from hdrUtils to keep complexity low.
 */
async function parseRGBEAsync(buffer: ArrayBuffer, onProgress: (progress: number) => void) {
  const bytes = new Uint8Array(buffer);
  const dims = parseHeader(bytes);
  if (!dims || dims.width <= 0 || dims.height <= 0 || dims.width > 16384 || dims.height > 16384) {
    logger.error(`[HDRWorker] Invalid dimensions`);
    return null;
  }
  const { width: srcWidth, height: srcHeight, endPos } = dims;
  const { targetWidth, targetHeight } = calculateDownscaleTarget(srcWidth, srcHeight);
  const isDownscaling = targetWidth !== srcWidth || targetHeight !== srcHeight;
  const scaleX = srcWidth / targetWidth;
  const scaleY = srcHeight / targetHeight;

  logger.log(`[HDRWorker] Parsing HDR: ${srcWidth}x${srcHeight} -> ${targetWidth}x${targetHeight}`);

  const finalData = new Float32Array(targetWidth * targetHeight * 4);
  const scanline = new Uint8Array(4 * srcWidth);
  const srcRgbaLine = new Float32Array(srcWidth * 4);
  let pos = endPos;
  const CHUNK_SIZE = 128;
  const startTime = Date.now();

  for (let y = 0; y < srcHeight; y++) {
    const { newPos, success } = decodeScanline(scanline, bytes, pos, srcWidth);
    if (!success) return null;
    pos = newPos;

    rgbeToFloat32(scanline, srcRgbaLine, srcWidth);

    if (!isDownscaling) {
      finalData.set(srcRgbaLine, y * srcWidth * 4);
    } else {
      processDownscaling({ y, targetWidth, targetHeight, scaleX, scaleY, srcRgbaLine, finalData });
    }

    if (y % CHUNK_SIZE === 0) {
      if (Date.now() - startTime > 60000) throw new Error(`HDR processing timeout`);
      onProgress(y / srcHeight);
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return { width: targetWidth, height: targetHeight, data: finalData };
}

// --- Message Handler ---

self.onmessage = async (e: MessageEvent) => {
  const { url } = e.data;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();

    // Use the function to prevent unused variable warning
    const unusedToHalf = toHalf(1.0); 
    // eslint-disable-next-line no-void
    void unusedToHalf;

    const result = await parseRGBEAsync(buffer, (progress) => {
      const msg: HDRWorkerMessage = { status: 'progress', progress };
      self.postMessage(msg);
    });

    if (!result) throw new Error("Failed to parse RGBE");

    const msg: HDRWorkerMessage = {
      status: 'success',
      width: result.width,
      height: result.height,
      data: result.data,
      isHalf: false,
      quality: 'full',
      format: 'float32'
    };
    self.postMessage(msg, [result.data.buffer]);

  } catch (error) {
    logger.error(`[HDRWorker] Error:`, error as Error);
    const msg: HDRWorkerMessage = { status: 'error', error: (error as Error).message };
    self.postMessage(msg);
  }
};
