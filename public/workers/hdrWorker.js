
/**
 * HDR Web Worker for Boby's World (Self-contained)
 * Handles parsing heavy 8K HDR files off-thread to prevent main thread blocking
 * Uses Transferable Objects for zero-copy memory transfer.
 */

// Precompute exponent table for RGBE (2^(e - 128 - 8))
const EXPO_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  EXPO_TABLE[i] = Math.pow(2, i - 128 - 8);
}

// Reusable buffers for half-float conversion
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

function toHalf(val) {
  f32[0] = val;
  const x = u32[0];
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 13) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= e === 255 && (x & 0x007fffff) !== 0 ? 0x0200 : 0;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

function parseHeader(bytes) {
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
    header += line + "\n";
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

function decodeChannel(scanline, bytes, startPos, width, channelIndex) {
  let pos = startPos;
  let j = 0;
  while (j < width) {
    if (pos >= bytes.length) return { newPos: pos, success: false };
    const code = bytes[pos++];
    if (code === undefined) continue;
    if (code > 128) {
      const count = code - 128;
      if (j + count > width || pos >= bytes.length) return { newPos: pos, success: false };
      const val = bytes[pos++];
      if (val !== undefined) {
        for (let k = 0; k < count; k++) scanline[j++ * 4 + channelIndex] = val;
      }
    } else {
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

function decodeScanline(scanline, bytes, startPos, width) {
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
    const result = decodeChannel(scanline, bytes, pos, width, i);
    if (!result.success) return result;
    pos = result.newPos;
  }
  return { newPos: pos, success: true };
}

function rgbeToFloat32(scanline, srcRgbaLine, width) {
  for (let x = 0; x < width; x++) {
    const r = scanline[x * 4];
    const g = scanline[x * 4 + 1];
    const b = scanline[x * 4 + 2];
    const e = scanline[x * 4 + 3];

    if (e !== undefined && e > 0) {
      const f = EXPO_TABLE[e] || 0;
      srcRgbaLine[x * 4] = (r || 0) * f;
      srcRgbaLine[x * 4 + 1] = (g || 0) * f;
      srcRgbaLine[x * 4 + 2] = (b || 0) * f;
      srcRgbaLine[x * 4 + 3] = 1.0;
    } else {
      srcRgbaLine[x * 4] = 0;
      srcRgbaLine[x * 4 + 1] = 0;
      srcRgbaLine[x * 4 + 2] = 0;
      srcRgbaLine[x * 4 + 3] = 1.0;
    }
  }
}

function calculateDownscaleTarget(width, height) {
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

function processDownscaling(opts) {
  const { y, targetWidth, targetHeight, scaleX, scaleY, srcRgbaLine, finalData } = opts;
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
    finalData[dstOff] = srcRgbaLine[srcOff] || 0;
    finalData[dstOff + 1] = srcRgbaLine[srcOff + 1] || 0;
    finalData[dstOff + 2] = srcRgbaLine[srcOff + 2] || 0;
    finalData[dstOff + 3] = srcRgbaLine[srcOff + 3] || 0;
  }
}

async function parseRGBEAsync(buffer, onProgress) {
  const bytes = new Uint8Array(buffer);
  const dims = parseHeader(bytes);
  if (!dims || dims.width <= 0 || dims.height <= 0 || dims.width > 16384 || dims.height > 16384) {
    return null;
  }
  const srcWidth = dims.width;
  const srcHeight = dims.height;
  const endPos = dims.endPos;
  const target = calculateDownscaleTarget(srcWidth, srcHeight);
  const targetWidth = target.targetWidth;
  const targetHeight = target.targetHeight;
  const isDownscaling = targetWidth !== srcWidth || targetHeight !== srcHeight;
  const scaleX = srcWidth / targetWidth;
  const scaleY = srcHeight / targetHeight;

  const finalData = new Float32Array(targetWidth * targetHeight * 4);
  const scanline = new Uint8Array(4 * srcWidth);
  const srcRgbaLine = new Float32Array(srcWidth * 4);
  let pos = endPos;
  const CHUNK_SIZE = 128;
  const startTime = Date.now();

  for (let y = 0; y < srcHeight; y++) {
    const result = decodeScanline(scanline, bytes, pos, srcWidth);
    if (!result.success) return null;
    pos = result.newPos;

    rgbeToFloat32(scanline, srcRgbaLine, srcWidth);

    if (!isDownscaling) {
      finalData.set(srcRgbaLine, y * srcWidth * 4);
    } else {
      processDownscaling({ y, targetWidth, targetHeight, scaleX, scaleY, srcRgbaLine, finalData });
    }

    if (y % CHUNK_SIZE === 0) {
      if (Date.now() - startTime > 60000) throw new Error("HDR processing timeout");
      onProgress(y / srcHeight);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return { width: targetWidth, height: targetHeight, data: finalData };
}

// --- Message Handler ---
self.onmessage = async function(e) {
  const { buffer } = e.data;

  try {
    if (!buffer || !(buffer instanceof ArrayBuffer)) {
      throw new Error("No ArrayBuffer received in worker message");
    }

    const unusedToHalf = toHalf(1.0);
    void unusedToHalf;

    const result = await parseRGBEAsync(buffer, function(progress) {
      self.postMessage({ status: "progress", progress: progress });
    });

    if (!result) throw new Error("Failed to parse RGBE");

    self.postMessage({
      status: "success",
      width: result.width,
      height: result.height,
      data: result.data,
      isHalf: false,
      quality: "full",
      format: "float32",
    }, [result.data.buffer]);
  } catch (error) {
    self.postMessage({ status: "error", error: error.message });
  }
};
