/**
 * Utilities for HDR Worker
 */

export type HDRWorkerMessage =
  | { status: "progress"; progress: number }
  | {
      status: "success";
      width: number;
      height: number;
      data: Float32Array;
      isHalf: boolean;
      quality: string;
      format: string;
    }
  | { status: "error"; error: string };

export interface DownscaleOptions {
  data: Float32Array;
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
}

export interface DecodeChannelOptions {
  scanline: Uint8Array;
  bytes: Uint8Array;
  startPos: number;
  width: number;
  channelIndex: number;
}

export interface ProcessBatchOptions {
  bytes: Uint8Array;
  scanline: Uint8Array;
  rgbaFloat: Float32Array;
  startOffset: number;
  startY: number;
  endY: number;
  width: number;
  startPos: number;
}

// Precompute exponent table for RGBE (2^(e - 128 - 8))
export const EXPO_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  EXPO_TABLE[i] = Math.pow(2, i - 128 - 8);
}

// Reusable buffers to avoid allocations per frame
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/**
 * Optimized Float32 to HalfFloat conversion.
 * Kept for potential future support of Float16 textures which save 50% memory.
 */
export function toHalf(val: number): number {
  f32[0] = val;
  const x = u32[0]!;

  let bits = (x >> 16) & 0x8000;
  let m = (x >> 13) & 0x07ff;
  const e = (x >> 23) & 0xff;

  if (e < 103) return bits; // Flush to zero or handle subnormals

  if (e > 142) {
    // Infinity/NaN
    bits |= 0x7c00;
    bits |= e === 255 && (x & 0x007fffff) !== 0 ? 0x0200 : 0;
    return bits;
  }

  if (e < 113) {
    // Subnormal
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }

  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1; // Rounding
  return bits;
}

/**
 * Parses the RGBE header to extract dimensions.
 */
export function parseHeader(
  bytes: Uint8Array
): { width: number; height: number; endPos: number } | null {
  let pos = 0;
  let header = "";

  while (pos < bytes.length) {
    let line = "";
    while (pos < bytes.length && bytes[pos] !== 10) {
      const charCode = bytes[pos++];
      if (charCode !== undefined) line += String.fromCharCode(charCode);
      if (line.length > 1024) break;
    }
    pos++;
    header += `${line}\n`;
    if (line === "" || header.length > 8192) break;
  }

  let dimensions = "";
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
    endPos: pos,
  };
}

/**
 * Decodes a single channel RLE run for a scanline.
 */
export function decodeChannel(options: DecodeChannelOptions): { newPos: number; success: boolean } {
  const { scanline, bytes, startPos, width, channelIndex } = options;
  let pos = startPos;
  let j = 0;

  while (j < width) {
    if (pos >= bytes.length) return { newPos: pos, success: false };

    const code = bytes[pos++];
    if (code === undefined) continue;

    if (code > 128) {
      // Run
      const count = code - 128;
      if (j + count > width || pos >= bytes.length) return { newPos: pos, success: false };
      const val = bytes[pos++];
      if (val !== undefined) {
        for (let k = 0; k < count; k++) scanline[j++ * 4 + channelIndex] = val;
      }
    } else {
      // Dump
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
export function decodeScanline(
  scanline: Uint8Array,
  bytes: Uint8Array,
  startPos: number,
  width: number
): { newPos: number; success: boolean } {
  let pos = startPos;

  if (pos + 4 > bytes.length) return { newPos: pos, success: false };

  const r_hdr = bytes[pos];
  const g_hdr = bytes[pos + 1];
  const b_hdr = bytes[pos + 2];
  pos += 4;

  if (r_hdr !== 2 || g_hdr !== 2 || (b_hdr !== undefined && b_hdr & 128)) {
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
 * Converts an RGBE scanline to Float32 RGBA.
 */
export function rgbeToFloat32(
  scanline: Uint8Array,
  srcRgbaLine: Float32Array,
  width: number
): void {
  for (let x = 0; x < width; x++) {
    const r = scanline[x * 4];
    const g = scanline[x * 4 + 1];
    const b = scanline[x * 4 + 2];
    const e = scanline[x * 4 + 3];

    if (e !== undefined && e > 0) {
      const f = EXPO_TABLE[e] ?? 0;
      srcRgbaLine[x * 4] = (r ?? 0) * f;
      srcRgbaLine[x * 4 + 1] = (g ?? 0) * f;
      srcRgbaLine[x * 4 + 2] = (b ?? 0) * f;
      srcRgbaLine[x * 4 + 3] = 1.0;
    } else {
      srcRgbaLine[x * 4] = 0;
      srcRgbaLine[x * 4 + 1] = 0;
      srcRgbaLine[x * 4 + 2] = 0;
      srcRgbaLine[x * 4 + 3] = 1.0;
    }
  }
}

export interface ProcessDownscalingOptions {
  y: number;
  targetWidth: number;
  targetHeight: number;
  scaleX: number;
  scaleY: number;
  srcRgbaLine: Float32Array;
  finalData: Float32Array;
}

/**
 * Applies on-the-fly downscaling for a single scanline.
 */
export function processDownscaling(options: ProcessDownscalingOptions): void {
  const { y, targetWidth, targetHeight, scaleX, scaleY, srcRgbaLine, finalData } = options;
  const ty = Math.floor(y / scaleY);
  if (ty >= targetHeight) return;

  const targetCenterY = (ty + 0.5) * scaleY;
  // Only update if this is the "best" scanline for this target row
  if (Math.abs(y - targetCenterY) >= scaleY * 0.5) return;

  const rowOffset = ty * targetWidth * 4;
  for (let tx = 0; tx < targetWidth; tx++) {
    const sx = Math.floor(tx * scaleX);
    const srcOff = sx * 4;
    const dstOff = rowOffset + tx * 4;
    finalData[dstOff] = srcRgbaLine[srcOff]!;
    finalData[dstOff + 1] = srcRgbaLine[srcOff + 1]!;
    finalData[dstOff + 2] = srcRgbaLine[srcOff + 2]!;
    finalData[dstOff + 3] = srcRgbaLine[srcOff + 3]!;
  }
}

/**
 * Calculates downscaled dimensions based on available memory heuristics.
 */
export function calculateDownscaleTarget(
  width: number,
  height: number
): { targetWidth: number; targetHeight: number } {
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
