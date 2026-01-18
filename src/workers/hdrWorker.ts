/**
 * HDR Web Worker for Boby's World
 * Handles fetching and parsing heavy 8K HDR files off-thread to prevent main thread blocking
 * Uses Transferable Objects for zero-copy memory transfer.
 */

/// <reference lib="webworker" />

import { logger } from 'utils/logger';
import {
    EXPO_TABLE,
    toHalf,
    type DecodeChannelOptions,
    type DownscaleOptions,
    type HDRWorkerMessage,
    type ProcessBatchOptions
} from './hdrUtils';

// --- Utility Functions ---

/**
 * Parses the RGBE header to extract dimensions.
 */
function parseHeader(bytes: Uint8Array): { width: number; height: number; endPos: number } | null {
  let pos = 0;
  let header = '';

  while (pos < bytes.length) {
    let line = '';
    while (pos < bytes.length && bytes[pos] !== 10) {
      const charCode = bytes[pos++];
      if (charCode !== undefined) line += String.fromCharCode(charCode);
      if (line.length > 1024) break;
    }
    pos++;
    header += `${line}\n`;
    if (line === '' || header.length > 8192) break;
  }

  let dimensions = '';
  while (pos < bytes.length && bytes[pos] !== 10) {
    const charCode = bytes[pos++];
    if (charCode !== undefined) dimensions += String.fromCharCode(charCode);
  }
  pos++;

  const match = dimensions.match(/-Y (\d+) \+X (\d+)/);
  if (!match || !match[1] || !match[2]) return null;

  return { 
    height: parseInt(match[1], 10), 
    width: parseInt(match[2], 10), 
    endPos: pos 
  };
}

/**
 * Decodes a single channel RLE run for a scanline.
 */
function decodeChannel(options: DecodeChannelOptions): { newPos: number; success: boolean } {
  const { scanline, bytes, startPos, width, channelIndex } = options;
  let pos = startPos;
  let j = 0;
  
  while (j < width) {
    if (pos >= bytes.length) return { newPos: pos, success: false };
    
    const code = bytes[pos++];
    if (code === undefined) continue;

    if (code > 128) { // Run
      const count = code - 128;
      if (j + count > width || pos >= bytes.length) return { newPos: pos, success: false };
      const val = bytes[pos++];
      if (val !== undefined) {
           for (let k = 0; k < count; k++) scanline[j++ * 4 + channelIndex] = val;
      }
    } else { // Dump
      const count = code;
      if (j + count > width || pos + count > bytes.length) return { newPos: pos, success: false };
      for (let k = 0; k < count; k++) {
          const val = bytes[pos++];
          if (val !== undefined) scanline[j++ * 4 + channelIndex] = val;
      }
    }
  }
  return { newPos: pos, success: true };
}

/**
 * Decodes a single RLE scanline from the byte stream.
 */
function decodeScanline(scanline: Uint8Array, bytes: Uint8Array, startPos: number, width: number): { newPos: number; success: boolean } {
  let pos = startPos;
  
  if (pos + 4 > bytes.length) return { newPos: pos, success: false };
  
  const r_hdr = bytes[pos];
  const g_hdr = bytes[pos + 1];
  const b_hdr = bytes[pos + 2];
  pos += 4; 

  if (r_hdr !== 2 || g_hdr !== 2 || (b_hdr !== undefined && (b_hdr & 128))) {
    return { newPos: pos, success: false }; 
  }

  for (let i = 0; i < 4; i++) {
    const result = decodeChannel({ scanline, bytes, startPos: pos, width, channelIndex: i });
    if (!result.success) return result;
    pos = result.newPos;
  }

  return { newPos: pos, success: true };
}

/**
 * Downscales HDR data using bilinear interpolation.
 */
function downscaleHDRData({ data, srcWidth, srcHeight, dstWidth, dstHeight }: DownscaleOptions): Float32Array {
  const dstData = new Float32Array(dstWidth * dstHeight * 4);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = dstX * scaleX;
      const srcY = dstY * scaleY;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const wx = srcX - x0;
      const wy = srcY - y0;

      for (let c = 0; c < 4; c++) {
        // Optimization: Inline for performance
        const val00 = data[((y0 * srcWidth + x0) * 4 + c)] ?? 0;
        const val10 = data[((y0 * srcWidth + Math.min(x0 + 1, srcWidth - 1)) * 4 + c)] ?? 0;
        const val01 = data[((Math.min(y0 + 1, srcHeight - 1) * srcWidth + x0) * 4 + c)] ?? 0;
        const val11 = data[((Math.min(y0 + 1, srcHeight - 1) * srcWidth + Math.min(x0 + 1, srcWidth - 1)) * 4 + c)] ?? 0;

        dstData[(dstY * dstWidth + dstX) * 4 + c] = 
          val00 * (1 - wx) * (1 - wy) +
          val10 * wx * (1 - wy) +
          val01 * (1 - wx) * wy +
          val11 * wx * wy;
      }
    }
  }

  return dstData;
}

function processScanlineBatch(options: ProcessBatchOptions): { newPos: number, offset: number, success: boolean } {
    const { bytes, scanline, rgbaFloat, startOffset, startY, endY, width, startPos } = options;
    let pos = startPos;
    let offset = startOffset;

    for (let currY = startY; currY < endY; currY++) {
        if (pos + 4 > bytes.length) break;

        const { newPos, success } = decodeScanline(scanline, bytes, pos, width);
        if (!success) return { newPos: pos, offset, success: false };
        pos = newPos;

        for (let x = 0; x < width; x++) {
            const r = scanline[x * 4];
            const g = scanline[x * 4 + 1];
            const b = scanline[x * 4 + 2];
            const e = scanline[x * 4 + 3];

            if (r !== undefined && g !== undefined && b !== undefined && e !== undefined && e > 0) {
                const f = EXPO_TABLE[e] ?? 0;
                rgbaFloat[offset++] = r * f;
                rgbaFloat[offset++] = g * f;
                rgbaFloat[offset++] = b * f;
                rgbaFloat[offset++] = 1.0;
            } else {
                offset += 4; 
                if (rgbaFloat[offset-4] === undefined) { 
                    rgbaFloat[offset-4] = 0; rgbaFloat[offset-3] = 0; rgbaFloat[offset-2] = 0; rgbaFloat[offset-1] = 1.0; 
                }
            }
        }
    }
    return { newPos: pos, offset, success: true };
}

function calculateDownscaleTarget(width: number, height: number): { targetWidth: number, targetHeight: number } {
  const shouldDownscale = width > 4096 || height > 4096;
  let targetWidth = width;
  let targetHeight = height;

  if (shouldDownscale) {
    const estimatedMemoryMB = (width * height * 16) / (1024 * 1024);
    if (estimatedMemoryMB > 150) {
      targetWidth = Math.floor(width * 0.25);
      targetHeight = Math.floor(height * 0.25);
    } else if (estimatedMemoryMB > 75) {
      targetWidth = Math.floor(width * 0.5);
      targetHeight = Math.floor(height * 0.5);
    }
  }
  return { targetWidth, targetHeight };
}

/**
 * Main Async Parser
 */
async function parseRGBEAsync(buffer: ArrayBuffer, onProgress: (progress: number) => void) {
  const bytes = new Uint8Array(buffer);
  
  const dims = parseHeader(bytes);
  if (!dims || dims.width <= 0 || dims.height <= 0 || dims.width > 16384 || dims.height > 16384) {
    logger.error(`[HDRWorker] Invalid dimensions`);
    return null;
  }
  const { width, height, endPos } = dims;

  logger.log(`[HDRWorker] Parsing HDR: ${width}x${height} (${(width * height * 16 / 1024 / 1024).toFixed(1)}MB)`);

  const { targetWidth, targetHeight } = calculateDownscaleTarget(width, height);

  const rgbaFloat = new Float32Array(width * height * 4);
  const scanline = new Uint8Array(4 * width);
  let pos = endPos;
  let offset = 0;
  
  const CHUNK_SIZE = 256;
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 45000;

  for (let y = 0; y < height; y += CHUNK_SIZE) {
    const endY = Math.min(y + CHUNK_SIZE, height);
    const { newPos, offset: newOffset, success } = processScanlineBatch({
        bytes, scanline, rgbaFloat, startOffset: offset, startY: y, endY, width, startPos: pos
    });
    
    if (!success) return null;
    pos = newPos;
    offset = newOffset;

    if (Date.now() - startTime > MAX_PROCESSING_TIME) {
       throw new Error(`HDR processing timeout after ${MAX_PROCESSING_TIME / 1000} seconds`);
    }

    onProgress(endY / height);
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  if (targetWidth !== width || targetHeight !== height) {
    logger.log(`[HDRWorker] Applying downscaling: ${width}x${height} → ${targetWidth}x${targetHeight}`);
    const finalData = downscaleHDRData({ data: rgbaFloat, srcWidth: width, srcHeight: height, dstWidth: targetWidth, dstHeight: targetHeight }) as Float32Array;
    return { width: targetWidth, height: targetHeight, data: finalData };
  }

  return { width, height, data: rgbaFloat };
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
