/**
 * Utilities for HDR Worker
 */

export type HDRWorkerMessage =
  | { status: 'progress'; progress: number }
  | { status: 'success'; width: number; height: number; data: Float32Array; isHalf: boolean; quality: string; format: string }
  | { status: 'error'; error: string };

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
