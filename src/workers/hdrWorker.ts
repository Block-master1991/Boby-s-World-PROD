/**
 * HDR Web Worker for Boby's World
 * Handles fetching and parsing heavy 8K HDR files off-thread to prevent main thread blocking
 * Uses Transferable Objects for zero-copy memory transfer.
 */

import { logger } from 'utils/logger';

// Simple RGBE Parser (Minimal implementation of RGBELoader logic for Worker context)
// This avoids importing the full Three.js library in the worker if possible,
// or we can import RGBELoader if the build system supports it.

// For now, let's use a standard fetch + minimal header parsing
// Note: In a real Next.js environment, we might need to handle imports carefully

// Precompute exponent table for RGBE (2^(e - 128 - 8))
const EXPO_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    EXPO_TABLE[i] = Math.pow(2, i - 128 - 8);
}

// Reusable buffers to avoid 132 million allocations per 8K frame
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/**
 * Optimized Float32 to HalfFloat conversion
 * No allocations in the hot path.
 */
function toHalf(val: number): number {
    f32[0] = val;
    const x = u32[0];

    let bits = (x >> 16) & 0x8000;
    let m = (x >> 13) & 0x07ff;
    let e = (x >> 23) & 0xff;

    if (e < 103) return bits; // Flush to zero or handle subnormals

    if (e > 142) { // Infinity/NaN
        bits |= 0x7c00;
        bits |= e === 255 && (x & 0x007fffff) !== 0 ? 0x0200 : 0;
        return bits;
    }

    if (e < 113) { // Subnormal
        m |= 0x0800;
        bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
        return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1; // Rounding
    return bits;
}

self.onmessage = async (e: MessageEvent) => {
    const { url } = e.data;

    try {
        logger.log(`[HDRWorker] Starting optimized fetch for: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const buffer = await response.arrayBuffer();
        logger.log(`[HDRWorker] Fetch complete (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB). Optimized Parsing...`);

        const result = await parseRGBEAsync(buffer, (progress) => {
            (self as any).postMessage({ status: 'progress', progress });
        });
        if (!result) throw new Error("Failed to parse or invalid HDR format");

        (self as any).postMessage({
            status: 'success',
            width: result.width,
            height: result.height,
            data: result.data,
            isHalf: false,
            // Add quality metadata for better handling
            quality: 'full',
            format: 'float32'
        }, [result.data.buffer]);

    } catch (error) {
        logger.error(`[HDRWorker] Error:`, error as Error);
        self.postMessage({ status: 'error', error: (error as Error).message });
    }
};

async function parseRGBEAsync(buffer: ArrayBuffer, onProgress: (progress: number) => void) {
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    // 1. Read Header
    let header = "";
    while (pos < bytes.length) {
        let line = "";
        while (pos < bytes.length && bytes[pos] !== 10) {
            line += String.fromCharCode(bytes[pos++]);
            if (line.length > 1024) break;
        }
        pos++;
        header += line + "\n";
        if (line === "" || header.length > 8192) break;
    }

    // 2. Read Dimensions
    let dimensions = "";
    while (pos < bytes.length && bytes[pos] !== 10) {
        dimensions += String.fromCharCode(bytes[pos++]);
    }
    pos++;

    const match = dimensions.match(/-Y (\d+) \+X (\d+)/);
    if (!match) return null;

    const height = parseInt(match[1]);
    const width = parseInt(match[2]);

    if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
        logger.error(`[HDRWorker] Invalid dimensions: ${width}x${height}`);
        return null;
    }

    logger.log(`[HDRWorker] Parsing HDR: ${width}x${height} (${(width * height * 4 * 4 / 1024 / 1024).toFixed(1)}MB)`);

    // Intelligent downscaling based on device capabilities and memory constraints
    const shouldDownscale = width > 4096 || height > 4096;
    let targetWidth = width;
    let targetHeight = height;

    if (shouldDownscale) {
        // Estimate memory usage for full resolution
        const estimatedMemoryMB = (width * height * 4 * 4) / (1024 * 1024);

        if (estimatedMemoryMB > 150) { // Very high memory usage (>150MB)
            targetWidth = Math.floor(width * 0.25); // 8K -> 2K (aggressive downscaling)
            targetHeight = Math.floor(height * 0.25);
            logger.log(`[HDRWorker] Aggressive downscaling: ${width}x${height} → ${targetWidth}x${targetHeight} (${estimatedMemoryMB.toFixed(1)}MB → ${((targetWidth * targetHeight * 4 * 4) / (1024 * 1024)).toFixed(1)}MB)`);
        } else if (estimatedMemoryMB > 75) { // High memory usage (>75MB)
            targetWidth = Math.floor(width * 0.5); // 8K -> 4K (moderate downscaling)
            targetHeight = Math.floor(height * 0.5);
            logger.log(`[HDRWorker] Moderate downscaling: ${width}x${height} → ${targetWidth}x${targetHeight} (${estimatedMemoryMB.toFixed(1)}MB → ${((targetWidth * targetHeight * 4 * 4) / (1024 * 1024)).toFixed(1)}MB)`);
        } else {
            logger.log(`[HDRWorker] Keeping original resolution: ${width}x${height} (${estimatedMemoryMB.toFixed(1)}MB)`);
        }
    }

    // Use original dimensions for parsing, downscale later if needed
    const rgbaFloat = new Float32Array(width * height * 4);
    let offset = 0;

    // Constants for Float
    const floatOne = 1.0;
    const scanline = new Uint8Array(4 * width);

    // Yield every CHUNK_SIZE rows to avoid blocking the worker event loop
    // Reduced chunk size for better performance on low-end devices
    const CHUNK_SIZE = 256;

    // Add timeout protection (45 seconds max)
    const startTime = Date.now();
    const MAX_PROCESSING_TIME = 45000; // 45 seconds

    for (let y = 0; y < height; y++) {
        if (y > 0 && y % CHUNK_SIZE === 0) {
            // Check for timeout
            if (Date.now() - startTime > MAX_PROCESSING_TIME) {
                throw new Error(`HDR processing timeout after ${MAX_PROCESSING_TIME / 1000} seconds`);
            }

            onProgress(y / height);
            // Yield to event loop
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        if (pos + 4 > bytes.length) break;

        const r_hdr = bytes[pos++];
        const g_hdr = bytes[pos++];
        const b_hdr = bytes[pos++];
        const e_hdr = bytes[pos++];

        if (r_hdr !== 2 || g_hdr !== 2 || (b_hdr & 128)) return null;

        for (let i = 0; i < 4; i++) {
            let j = 0;
            while (j < width) {
                if (pos >= bytes.length) return null;
                const code = bytes[pos++];
                if (code > 128) {
                    const count = code - 128;
                    if (j + count > width || pos >= bytes.length) return null;
                    const val = bytes[pos++];
                    for (let k = 0; k < count; k++) scanline[j++ * 4 + i] = val;
                } else {
                    const count = code;
                    if (j + count > width || pos + count > bytes.length) return null;
                    for (let k = 0; k < count; k++) scanline[j++ * 4 + i] = bytes[pos++];
                }
            }
        }

        // Optimized conversion loop
        for (let x = 0; x < width; x++) {
            const idx = x * 4;
            const r = scanline[idx];
            const g = scanline[idx + 1];
            const b = scanline[idx + 2];
            const e = scanline[idx + 3];

            if (e > 0) {
                const f = EXPO_TABLE[e];
                rgbaFloat[offset++] = r * f;
                rgbaFloat[offset++] = g * f;
                rgbaFloat[offset++] = b * f;
                rgbaFloat[offset++] = floatOne;
            } else {
                rgbaFloat[offset++] = 0;
                rgbaFloat[offset++] = 0;
                rgbaFloat[offset++] = 0;
                rgbaFloat[offset++] = floatOne;
            }
        }
    }

    // Apply downscaling if needed
    let finalData = rgbaFloat;
    let finalWidth = width;
    let finalHeight = height;

    if (shouldDownscale && (targetWidth !== width || targetHeight !== height)) {
        logger.log(`[HDRWorker] Applying downscaling: ${width}x${height} → ${targetWidth}x${targetHeight}`);
        finalData = downscaleHDRData(rgbaFloat, width, height, targetWidth, targetHeight);
        finalWidth = targetWidth;
        finalHeight = targetHeight;
    }

    return { width: finalWidth, height: finalHeight, data: finalData };
}

/**
 * Downscale HDR data using bilinear interpolation for better quality than WebGL automatic scaling
 */
function downscaleHDRData(data: Float32Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Float32Array<ArrayBuffer> {
    const dstData = new Float32Array(dstWidth * dstHeight * 4);

    const scaleX = srcWidth / dstWidth;
    const scaleY = srcHeight / dstHeight;

    for (let dstY = 0; dstY < dstHeight; dstY++) {
        for (let dstX = 0; dstX < dstWidth; dstX++) {
            // Calculate source coordinates
            const srcX = dstX * scaleX;
            const srcY = dstY * scaleY;

            // Get integer and fractional parts
            const x0 = Math.floor(srcX);
            const y0 = Math.floor(srcY);
            const x1 = Math.min(x0 + 1, srcWidth - 1);
            const y1 = Math.min(y0 + 1, srcHeight - 1);

            const wx = srcX - x0;
            const wy = srcY - y0;

            // Bilinear interpolation for each channel
            for (let c = 0; c < 4; c++) {
                const idx00 = (y0 * srcWidth + x0) * 4 + c;
                const idx10 = (y0 * srcWidth + x1) * 4 + c;
                const idx01 = (y1 * srcWidth + x0) * 4 + c;
                const idx11 = (y1 * srcWidth + x1) * 4 + c;

                const val00 = data[idx00];
                const val10 = data[idx10];
                const val01 = data[idx01];
                const val11 = data[idx11];

                // Bilinear interpolation
                const val = val00 * (1 - wx) * (1 - wy) +
                    val10 * wx * (1 - wy) +
                    val01 * (1 - wx) * wy +
                    val11 * wx * wy;

                dstData[(dstY * dstWidth + dstX) * 4 + c] = val;
            }
        }
    }

    return dstData;
}
