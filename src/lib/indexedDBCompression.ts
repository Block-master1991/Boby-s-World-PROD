// Enhanced IndexedDB operations with compression support
// Extends base indexedDB functionality with data compression for large assets

import { logger } from "@/utils/logger";
import type { AssetMetadata } from "./indexedDB";
import { getAsset, putAsset } from "./indexedDB";

/**
 * Check if CompressionStream API is available
 */
export function isCompressionSupported(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/**
 * Compress ArrayBuffer using CompressionStream API (gzip)
 */
export async function compressData(data: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isCompressionSupported()) {
    logger.warn("[Compression] CompressionStream not supported, returning uncompressed data");
    return data;
  }

  try {
    const startTime = performance.now();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });

    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const chunks: Uint8Array[] = [];
    const reader = compressedStream.getReader();

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const compressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }

    const compressionTime = performance.now() - startTime;
    const originalSizeMB = data.byteLength / (1024 * 1024);
    const compressedSizeMB = compressed.byteLength / (1024 * 1024);
    const ratio = ((1 - compressed.byteLength / data.byteLength) * 100).toFixed(1);

    logger.log(
      `[Compression] Compressed ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB ` +
        `(${ratio}% reduction) in ${compressionTime.toFixed(0)}ms`
    );

    return compressed.buffer;
  } catch (error) {
    logger.error("[Compression] Failed to compress data:", error);
    return data; // Fallback to uncompressed
  }
}

/**
 * Decompress ArrayBuffer using DecompressionStream API (gzip)
 */
export async function decompressData(compressedData: ArrayBuffer): Promise<ArrayBuffer> {
  if (!isCompressionSupported()) {
    logger.warn("[Decompression] DecompressionStream not supported");
    return compressedData;
  }

  try {
    const startTime = performance.now();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(compressedData));
        controller.close();
      },
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream("gzip"));
    const chunks: Uint8Array[] = [];
    const reader = decompressedStream.getReader();

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    // Combine chunks
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    const decompressionTime = performance.now() - startTime;
    logger.log(`[Decompression] Decompressed in ${decompressionTime.toFixed(0)}ms`);

    return decompressed.buffer;
  } catch (error) {
    logger.error("[Decompression] Failed to decompress data:", error);
    throw error;
  }
}

/**
 * Store asset with automatic compression for large files
 */
export async function putAssetCompressed(
  asset: AssetMetadata & { data: ArrayBuffer },
  compressionThresholdMB: number = 5 // Compress files larger than 5MB
): Promise<void> {
  const sizeMB = asset.size / (1024 * 1024);

  if (sizeMB >= compressionThresholdMB && isCompressionSupported()) {
    logger.log(`[IndexedDB] Compressing large asset: ${asset.name} (${sizeMB.toFixed(2)}MB)`);

    const compressedData = await compressData(asset.data);
    const compressedAsset = {
      ...asset,
      data: compressedData,
      compressed: true,
      originalSize: asset.size,
      size: compressedData.byteLength,
    };

    await putAsset(compressedAsset);
  } else {
    await putAsset(asset);
  }
}

/**
 * Retrieve asset with automatic decompression
 */
export async function getAssetDecompressed(
  id: string
): Promise<(AssetMetadata & { data: ArrayBuffer }) | null> {
  const asset = await getAsset(id);

  if (!asset) return null;

  if (asset.compressed) {
    logger.log(`[IndexedDB] Decompressing asset: ${asset.name}`);
    const decompressedData = await decompressData(asset.data);

    return {
      ...asset,
      data: decompressedData,
      size:
        (asset as AssetMetadata & { originalSize?: number }).originalSize ||
        decompressedData.byteLength,
    };
  }

  return asset;
}

/**
 * Calculate compression benefit for a file
 */
export async function calculateCompressionBenefit(data: ArrayBuffer): Promise<{
  originalSizeMB: number;
  compressedSizeMB: number;
  reductionPercent: number;
  worthCompressing: boolean;
}> {
  if (!isCompressionSupported()) {
    return {
      originalSizeMB: data.byteLength / (1024 * 1024),
      compressedSizeMB: data.byteLength / (1024 * 1024),
      reductionPercent: 0,
      worthCompressing: false,
    };
  }

  const compressed = await compressData(data);
  const originalSizeMB = data.byteLength / (1024 * 1024);
  const compressedSizeMB = compressed.byteLength / (1024 * 1024);
  const reductionPercent = (1 - compressed.byteLength / data.byteLength) * 100;

  // Worth compressing if we save at least 10% and file is > 1MB
  const worthCompressing = reductionPercent > 10 && originalSizeMB > 1;

  return {
    originalSizeMB,
    compressedSizeMB,
    reductionPercent,
    worthCompressing,
  };
}

/**
 * Batch compression analysis for multiple assets
 */
export async function analyzeCompressionForAssets(
  assets: Array<{ path: string; data: ArrayBuffer; type: string }>
): Promise<{
  totalOriginalMB: number;
  totalCompressedMB: number;
  totalSavingsMB: number;
  savingsPercent: number;
  assetDetails: Array<{
    path: string;
    originalMB: number;
    compressedMB: number;
    savingsMB: number;
    worthCompressing: boolean;
  }>;
}> {
  logger.log("[Compression] Analyzing compression benefits for assets...");

  const benefits = await Promise.all(assets.map(asset => calculateCompressionBenefit(asset.data)));

  let totalOriginal = 0,
    totalCompressed = 0;
  const assetDetails = benefits.map((benefit, index) => {
    totalOriginal += benefit.originalSizeMB;
    totalCompressed += benefit.compressedSizeMB;
    return {
      path: assets[index]!.path,
      originalMB: benefit.originalSizeMB,
      compressedMB: benefit.compressedSizeMB,
      savingsMB: benefit.originalSizeMB - benefit.compressedSizeMB,
      worthCompressing: benefit.worthCompressing,
    };
  });

  const totalSavingsMB = totalOriginal - totalCompressed;
  const savingsPercent = totalOriginal > 0 ? (totalSavingsMB / totalOriginal) * 100 : 0;

  logger.log(
    `[Compression] Analysis complete: ${totalOriginal.toFixed(2)}MB → ${totalCompressed.toFixed(2)}MB (${savingsPercent.toFixed(1)}% savings)`
  );

  return {
    totalOriginalMB: totalOriginal,
    totalCompressedMB: totalCompressed,
    totalSavingsMB,
    savingsPercent,
    assetDetails,
  };
}

/**
 * Smart compression decision based on file type
 */
export function shouldCompressAssetType(type: string, sizeMB: number): boolean {
  // Already compressed formats - don't re-compress
  const noCompress = ["mp3", "jpg", "jpeg", "png", "webp"];
  const extension = type.toLowerCase();

  if (noCompress.includes(extension)) {
    return false;
  }

  // Compress large uncompressed formats
  const compress = ["glb", "gltf", "hdr", "wav", "bmp", "tiff"];
  if (compress.includes(extension) && sizeMB > 2) {
    return true;
  }

  // Default: compress if > 5MB
  return sizeMB > 5;
}
