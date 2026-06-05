// src/workers/modelProcessor.worker.ts
import * as THREE from "three";

// --- TYPE DEFINITIONS ---
interface WorkerEventData {
  type: "COMPRESS_GEOMETRY";
  id?: string;
  data: {
    attributes: { [name: string]: { array: ArrayBuffer; itemSize: number } };
    index: { array: ArrayBuffer } | null;
    quantization?: { min: number; scale: number };
  };
}

interface WorkerResponseData {
  type: "COMPRESS_GEOMETRY_COMPLETE" | "ERROR";
  id?: string;
  data?: WorkerEventData["data"];
  error?: string;
}

// --- HELPER FUNCTIONS ---

const getTypedArray = (attrName: string, buffer: ArrayBuffer) => {
  if (["position", "normal", "tangent", "uv", "uv2"].includes(attrName)) {
    return new Float32Array(buffer);
  }
  return new Float32Array(buffer);
};

const loadGeometry = (geometryData: WorkerEventData["data"]) => {
  const geometry = new THREE.BufferGeometry();
  for (const attrName in geometryData.attributes) {
    const attr = geometryData.attributes[attrName];
    if (attr) {
      const typedArray = getTypedArray(attrName, attr.array);
      geometry.setAttribute(attrName, new THREE.BufferAttribute(typedArray, attr.itemSize));
    }
  }
  if (geometryData.index) {
    const indexArray =
      geometryData.index.array instanceof ArrayBuffer
        ? new Uint32Array(geometryData.index.array)
        : geometryData.index.array;
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  }
  return geometry;
};

const compressPosition = (
  geometry: THREE.BufferGeometry,
  geometryData: WorkerEventData["data"]
) => {
  const positionAttr = geometry.getAttribute("position");
  if (!positionAttr || !geometryData.attributes["position"]) return;

  const originalArray = positionAttr.array as Float32Array;
  const quantizedArray = new Int16Array(originalArray.length);
  let min = Infinity,
    max = -Infinity;

  for (let i = 0; i < originalArray.length; i++) {
    const val = originalArray[i];
    if (val !== undefined) {
      min = Math.min(min, val);
      max = Math.max(max, val);
    }
  }

  const range = max - min;
  const scale = range !== 0 ? range / 65535 : 0;

  for (let i = 0; i < originalArray.length; i++) {
    const val = originalArray[i];
    if (val !== undefined) {
      quantizedArray[i] = Math.round(
        THREE.MathUtils.clamp((val - min) / (scale || 1), -32768, 32767)
      );
    }
  }

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(quantizedArray, positionAttr.itemSize)
  );
  geometryData.attributes["position"].array = quantizedArray.buffer;
  geometryData.quantization = { min, scale };
};

const compressUV = (geometry: THREE.BufferGeometry, geometryData: WorkerEventData["data"]) => {
  const uvAttr = geometry.getAttribute("uv");
  if (!uvAttr || !geometryData.attributes["uv"]) return;

  const originalArray = uvAttr.array as Float32Array;
  const quantizedArray = new Uint16Array(originalArray.length);

  for (let i = 0; i < originalArray.length; i++) {
    const val = originalArray[i];
    if (val !== undefined) {
      quantizedArray[i] = Math.round(THREE.MathUtils.clamp(val * 65535, 0, 65535));
    }
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(quantizedArray, uvAttr.itemSize));
  geometryData.attributes["uv"].array = quantizedArray.buffer;
};

const compressNormal = (geometry: THREE.BufferGeometry, geometryData: WorkerEventData["data"]) => {
  const normalAttr = geometry.getAttribute("normal");
  if (!normalAttr || !geometryData.attributes["normal"]) return;

  const originalArray = normalAttr.array as Float32Array;
  const quantizedArray = new Int8Array(originalArray.length);

  for (let i = 0; i < originalArray.length; i++) {
    const val = originalArray[i];
    if (val !== undefined) {
      quantizedArray[i] = Math.round(THREE.MathUtils.clamp(val * 127, -127, 127));
    }
  }

  geometry.setAttribute("normal", new THREE.BufferAttribute(quantizedArray, normalAttr.itemSize));
  geometryData.attributes["normal"].array = quantizedArray.buffer;
};

// --- COMPRESSION LOGIC ---
const compressGeometryAdvanced = (geometryData: WorkerEventData["data"]) => {
  const geometry = loadGeometry(geometryData);

  compressPosition(geometry, geometryData);
  compressUV(geometry, geometryData);
  compressNormal(geometry, geometryData);

  if (geometry.index && geometryData.index) {
    geometryData.index.array = new Uint32Array(geometry.index.array).buffer as ArrayBuffer;
  }

  for (const attrName in geometryData.attributes) {
    if (!["position", "uv", "normal"].includes(attrName)) {
      const attr = geometry.getAttribute(attrName);
      if (attr && geometryData.attributes[attrName]) {
        const arrayBuffer = new ArrayBuffer(attr.array.byteLength);
        new Uint8Array(arrayBuffer).set(new Uint8Array(attr.array.buffer));
        geometryData.attributes[attrName].array = arrayBuffer;
      }
    }
  }

  return geometryData;
};

// --- MESSAGE HANDLER ---
self.onmessage = (event: MessageEvent<WorkerEventData>) => {
  const { type, id, data } = event.data;

  try {
    if (type === "COMPRESS_GEOMETRY") {
      const compressedGeometry = compressGeometryAdvanced(data);
      const transferables = Object.values(compressedGeometry.attributes).map(attr => attr.array);
      if (compressedGeometry.index) {
        transferables.push(compressedGeometry.index.array);
      }
      self.postMessage(
        {
          type: "COMPRESS_GEOMETRY_COMPLETE",
          id,
          data: compressedGeometry,
        } as WorkerResponseData,
        { transfer: transferables }
      );
    } else {
      throw new Error(`Unknown worker type: ${type}`);
    }
  } catch (error: unknown) {
    self.postMessage({
      type: "ERROR",
      id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
