// src/lib/indexedDB/utils.ts - Utility functions
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Efficient checksum for large binary data without string conversion
 */
export function generateQuickChecksum(data: any): string {
  if (data instanceof ArrayBuffer) {
    // For large buffers, sample the data instead of converting to string
    const view = new Uint8Array(data);
    const len = view.length;

    // Sample head, middle, and tail (total 32 bytes or less)
    let sample = `size:${len}`;

    if (len > 0) {
      // First 10 bytes
      for (let i = 0; i < Math.min(10, len); i++) sample += (view[i] ?? 0).toString(16);
      // Middle 10 bytes
      const mid = Math.floor(len / 2);
      for (let i = 0; i < Math.min(10, len - mid); i++) sample += (view[mid + i] ?? 0).toString(16);
      // Last 10 bytes
      const end = Math.max(0, len - 10);
      for (let i = 0; i < Math.min(10, len - end); i++) sample += (view[end + i] ?? 0).toString(16);
    }

    return generateStringHash(sample);
  }

  return generateStringHash(typeof data === 'string' ? data : JSON.stringify(data));
}

/**
 * Lightweight string hashing
 */
export function generateStringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
