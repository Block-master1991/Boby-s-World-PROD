import * as THREE from "three";
import { logger } from "../logger";
import { type GeometryData, type TypedArray } from "./types";
import { workerManager } from "./WorkerManager";

// --- Serialization Helpers ---

export function serializeGeometry(geometry: THREE.BufferGeometry): GeometryData {
  const attributes: Record<string, { array: TypedArray; itemSize: number }> = {};

  for (const name in geometry.attributes) {
    const attribute = geometry.getAttribute(name);
    if (attribute) {
      attributes[name] = {
        array: attribute.array.slice(0) as TypedArray,
        itemSize: attribute.itemSize,
      };
    }
  }

  const index = geometry.index
    ? {
        array: geometry.index.array.slice(0) as TypedArray,
      }
    : null;

  return { attributes, index };
}

export function deserializeGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  for (const name in data.attributes) {
    const attrData = data.attributes[name];
    if (attrData) {
      let buffer: TypedArray;
      if (name === "position") buffer = new Int16Array(attrData.array.buffer);
      else if (name === "uv") buffer = new Uint16Array(attrData.array.buffer);
      else if (name === "normal") buffer = new Int8Array(attrData.array.buffer);
      else buffer = new Float32Array(attrData.array.buffer);

      geometry.setAttribute(name, new THREE.BufferAttribute(buffer, attrData.itemSize));
    }
  }

  if (data.index) {
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.index.array.buffer), 1));
  }

  if (data["quantization"]) {
    geometry.userData["quantization"] = data["quantization"];
  }

  return geometry;
}

// --- Compression Manager ---

export class CompressionManager {
  private static instance: CompressionManager;
  private compressionLevels: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): CompressionManager {
    if (!CompressionManager.instance) {
      CompressionManager.instance = new CompressionManager();
    }
    return CompressionManager.instance;
  }

  public async compressModel(model: THREE.Group, level: number = 1): Promise<THREE.Group> {
    const promises: Promise<void>[] = [];

    model.traverse(object => {
      if ((object as THREE.Mesh).isMesh) {
        const mesh = object as THREE.Mesh;
        const promise = this.compressGeometry(mesh.geometry as THREE.BufferGeometry, level)
          .then(compressedGeometry => {
            mesh.geometry.dispose();
            mesh.geometry = compressedGeometry;
          })
          .catch(err => logger.error(`[CompressionManager] Geometry compression failed`, err));
        promises.push(promise);
      }
    });

    await Promise.all(promises);
    return model;
  }

  public async compressGeometry(
    geometry: THREE.BufferGeometry,
    level: number
  ): Promise<THREE.BufferGeometry> {
    try {
      const serialized = serializeGeometry(geometry);
      const result = (await workerManager.executeTask("COMPRESS_GEOMETRY", {
        geometry: serialized,
        level,
      })) as GeometryData;

      return deserializeGeometry(result);
    } catch (error) {
      logger.error(`[CompressionManager] Worker task failed, returning original geometry`, error);
      return geometry;
    }
  }

  public setCompressionLevel(path: string, level: number): void {
    this.compressionLevels.set(path, level);
  }

  public getCompressionLevel(path: string): number {
    return this.compressionLevels.get(path) || 1;
  }
}

export const compressionManager = CompressionManager.getInstance();
