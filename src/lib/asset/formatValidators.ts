/**
 * Format-specific validators for game assets
 */

/**
 * Validate GLB (glTF Binary) format
 */
export function validateGLBFormat(data: ArrayBuffer): boolean {
    if (data.byteLength < 12) return false;
    const view = new DataView(data);
    const magic = view.getUint32(0, true);
    // GLB magic number is 'glTF'
    return magic === 0x46546C67; // 'glTF' in little-endian
}

/**
 * Validate HDR (Radiance RGBE) format
 */
export function validateHDRFormat(data: ArrayBuffer): boolean {
    if (data.byteLength < 20) return false;
    // Check for "#?RADIANCE" or "#?RGBE" header
    const header = new TextDecoder().decode(data.slice(0, 20));
    return header.includes('#?RADIANCE') || header.includes('#?RGBE');
}

/**
 * Validate audio format based on file extension and basic frame sync
 */
export function validateAudioFormat(data: ArrayBuffer, path: string): boolean {
    if (data.byteLength < 44) return false;
    const extension = path.split('.').pop()?.toLowerCase();

    if (extension === 'mp3') {
        const view = new Uint8Array(data);
        const searchLimit = Math.min(100, data.byteLength - 1);
        for (let i = 0; i < searchLimit; i++) {
            const currentByte = view[i];
            const nextByte = view[i + 1];
            if (currentByte !== undefined && nextByte !== undefined) {
                if (currentByte === 0xFF && (nextByte & 0xE0) === 0xE0) {
                    return true;
                }
            }
        }
        return false;
    }

    return data.byteLength > 1000;
}
