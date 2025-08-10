// src/workers/modelProcessor.worker.ts
import * as THREE from 'three';

// --- TYPE DEFINITIONS ---
interface WorkerEventData {
  type: 'COMPRESS_GEOMETRY';
  data: {
    attributes: { [name: string]: { array: ArrayBuffer, itemSize: number } };
    index: { array: ArrayBuffer } | null;
  };
}

interface WorkerResponseData {
  type: 'COMPRESS_GEOMETRY_COMPLETE' | 'ERROR';
  data?: any;
  error?: string;
}

// --- MESSAGE HANDLER ---
self.onmessage = async (event: MessageEvent<WorkerEventData>) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'COMPRESS_GEOMETRY':
        const compressedGeometry = compressGeometryAdvanced(data);
        // Transferable objects for performance
        const transferables = Object.values(compressedGeometry.attributes).map(attr => attr.array);
        if (compressedGeometry.index) {
            transferables.push(compressedGeometry.index.array);
        }
        self.postMessage({ type: 'COMPRESS_GEOMETRY_COMPLETE', data: compressedGeometry }, { transfer: transferables });
        break;
      default:
        throw new Error(`Unknown worker type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};

// --- COMPRESSION LOGIC ---
const compressGeometryAdvanced = (geometryData: WorkerEventData['data']) => {
  // 1. Compress position attribute
  const posAttr = geometryData.attributes.position;
  if (posAttr) {
    const originalArray = new Float32Array(posAttr.array);
    const quantizedArray = new Int16Array(originalArray.length);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < originalArray.length; i++) {
      min = Math.min(min, originalArray[i]);
      max = Math.max(max, originalArray[i]);
    }
    const range = max - min;
    const scale = range !== 0 ? range / 65535 : 0;
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round((originalArray[i] - min) / (scale || 1));
    }
    geometryData.attributes.position.array = quantizedArray.buffer;
    // @ts-ignore
    geometryData.quantization = { min, scale }; // Send quantization info back
  }

  // 2. Compress UV attribute
  const uvAttr = geometryData.attributes.uv;
  if (uvAttr) {
    const originalArray = new Float32Array(uvAttr.array);
    const quantizedArray = new Uint16Array(originalArray.length);
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round(originalArray[i] * 65535);
    }
    geometryData.attributes.uv.array = quantizedArray.buffer;
  }

  // 3. Compress normal attribute
  const normalAttr = geometryData.attributes.normal;
  if (normalAttr) {
    const originalArray = new Float32Array(normalAttr.array);
    const quantizedArray = new Int8Array(originalArray.length);
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round(originalArray[i] * 127);
    }
    geometryData.attributes.normal.array = quantizedArray.buffer;
  }
  
  return geometryData;
};
