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
  data?: {
    attributes: { [name: string]: { array: ArrayBuffer, itemSize: number } };
    index: { array: ArrayBuffer } | null;
    quantization?: { min: number; scale: number };
  };
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
            self.postMessage({ 
      type: 'COMPRESS_GEOMETRY_COMPLETE', 
      data: compressedGeometry as WorkerResponseData['data'] 
    }, { transfer: transferables });
        break;
      default:
        throw new Error(`Unknown worker type: ${type}`);
    }
  } catch (error: unknown) {
    self.postMessage({ type: 'ERROR', error: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// --- COMPRESSION LOGIC ---
const compressGeometryAdvanced = (geometryData: WorkerEventData['data']) => {
  // إنشاء كائن هندسة THREE مؤقت للمعالجة
  const geometry = new THREE.BufferGeometry();
  
  // تحميل البيانات في كائن THREE
  for (const attrName in geometryData.attributes) {
    const attr = geometryData.attributes[attrName];
    // تحويل ArrayBuffer إلى TypedArray مناسب
    let typedArray;
    if (attrName === 'position' || attrName === 'normal' || attrName === 'tangent') {
      typedArray = new Float32Array(attr.array);
    } else if (attrName === 'uv' || attrName === 'uv2') {
      typedArray = new Float32Array(attr.array);
    } else {
      // للسمات الأخرى، استخدم Float32Array كافتراضي
      typedArray = new Float32Array(attr.array);
    }
    geometry.setAttribute(attrName, new THREE.BufferAttribute(typedArray, attr.itemSize));
  }
  
  if (geometryData.index) {
    // تحويل ArrayBuffer إلى TypedArray مناسب
    const indexArray = geometryData.index.array instanceof ArrayBuffer 
      ? new Uint32Array(geometryData.index.array) 
      : geometryData.index.array;
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  }
  // 1. Compress position attribute
  const positionAttr = geometry.getAttribute('position');
  if (positionAttr) {
    const originalArray = positionAttr.array as Float32Array;
    const quantizedArray = new Int16Array(originalArray.length);
    let min = Infinity, max = -Infinity;
    
    // استخدام THREE.MathUtils للعثور على القيم الدنيا والقصوى
    for (let i = 0; i < originalArray.length; i++) {
      min = Math.min(min, originalArray[i]);
      max = Math.max(max, originalArray[i]);
    }
    
    const range = max - min;
    const scale = range !== 0 ? range / 65535 : 0;
    
    // استخدام THREE.MathUtils للتكميم
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round(THREE.MathUtils.clamp((originalArray[i] - min) / (scale || 1), -32768, 32767));
    }
    
    // تحديث البيانات في كائن THREE والبيانات الأصلية
    geometry.setAttribute('position', new THREE.BufferAttribute(quantizedArray, positionAttr.itemSize));
    geometryData.attributes.position.array = quantizedArray.buffer;
    
    // @ts-expect-error - Adding property not defined in the type
    geometryData.quantization = { min, scale }; // Send quantization info back
  }

  // 2. Compress UV attribute
  const uvAttr = geometry.getAttribute('uv');
  if (uvAttr) {
    const originalArray = uvAttr.array as Float32Array;
    const quantizedArray = new Uint16Array(originalArray.length);
    
    // استخدام THREE.MathUtils للتكميم
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round(THREE.MathUtils.clamp(originalArray[i] * 65535, 0, 65535));
    }
    
    // تحديث البيانات في كائن THREE والبيانات الأصلية
    geometry.setAttribute('uv', new THREE.BufferAttribute(quantizedArray, uvAttr.itemSize));
    geometryData.attributes.uv.array = quantizedArray.buffer;
  }

  // 3. Compress normal attribute
  const normalAttr = geometry.getAttribute('normal');
  if (normalAttr) {
    const originalArray = normalAttr.array as Float32Array;
    const quantizedArray = new Int8Array(originalArray.length);
    
    // استخدام THREE.MathUtils للتكميم
    for (let i = 0; i < originalArray.length; i++) {
      quantizedArray[i] = Math.round(THREE.MathUtils.clamp(originalArray[i] * 127, -127, 127));
    }
    
    // تحديث البيانات في كائن THREE والبيانات الأصلية
    geometry.setAttribute('normal', new THREE.BufferAttribute(quantizedArray, normalAttr.itemSize));
    geometryData.attributes.normal.array = quantizedArray.buffer;
  }
  
  // تحديث الفهارس في كائن THREE والبيانات الأصلية
  if (geometry.index && geometryData.index) {
    geometryData.index.array = new Uint32Array(geometry.index.array).buffer as ArrayBuffer;
  }
  
  // تحديث جميع السمات في البيانات الأصلية
  for (const attrName in geometryData.attributes) {
    if (attrName !== 'position' && attrName !== 'uv' && attrName !== 'normal') {
      const attr = geometry.getAttribute(attrName);
      if (attr) {
        // إنشاء نسخة من ArrayBuffer لضمان النوع الصحيح
        const arrayBuffer = new ArrayBuffer(attr.array.byteLength);
        const view = new Uint8Array(arrayBuffer);
        view.set(new Uint8Array(attr.array.buffer));
        geometryData.attributes[attrName].array = arrayBuffer;
      }
    }
  }
  
  return geometryData;
};
