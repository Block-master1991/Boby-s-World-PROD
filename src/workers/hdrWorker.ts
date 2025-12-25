/**
 * HDR Web Worker for Boby's World
 * Handles fetching and parsing heavy 8K HDR files off-thread to prevent main thread blocking
 * Uses Transferable Objects for zero-copy memory transfer.
 */

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
        console.log(`[HDRWorker] Starting optimized fetch for: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const buffer = await response.arrayBuffer();
        console.log(`[HDRWorker] Fetch complete (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB). Optimized Parsing...`);

        const result = await parseRGBEAsync(buffer, (progress) => {
            (self as any).postMessage({ status: 'progress', progress });
        });
        if (!result) throw new Error("Failed to parse or invalid HDR format");

        (self as any).postMessage({
            status: 'success',
            width: result.width,
            height: result.height,
            data: result.data,
            isHalf: true
        }, [result.data.buffer]);

    } catch (error) {
        console.error(`[HDRWorker] Error:`, error);
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

    if (width <= 0 || height <= 0 || width > 16384 || height > 16384) return null;

    const rgbaHalf = new Uint16Array(width * height * 4);
    let offset = 0;

    // Constants for HalfFloat
    const halfOne = toHalf(1.0);
    const scanline = new Uint8Array(4 * width);

    // Yield every CHUNK_SIZE rows to avoid blocking the worker event loop
    const CHUNK_SIZE = 512;

    for (let y = 0; y < height; y++) {
        if (y > 0 && y % CHUNK_SIZE === 0) {
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
                rgbaHalf[offset++] = toHalf(r * f);
                rgbaHalf[offset++] = toHalf(g * f);
                rgbaHalf[offset++] = toHalf(b * f);
                rgbaHalf[offset++] = halfOne;
            } else {
                rgbaHalf[offset++] = 0;
                rgbaHalf[offset++] = 0;
                rgbaHalf[offset++] = 0;
                rgbaHalf[offset++] = halfOne;
            }
        }
    }

    return { width, height, data: rgbaHalf };
}
