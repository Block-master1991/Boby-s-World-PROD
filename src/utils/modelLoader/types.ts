import type * as THREE from "three";

export enum LoadPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export interface PriorityRequest {
  path: string;
  priority: LoadPriority;
  resolve: (model: THREE.Group) => void;
  reject: (reason?: unknown) => void;
  compress: boolean;
  instanceId?: string | undefined;
}

export interface MemoryInfo {
  size: number;
  lastAccessed: number;
  accessCount: number;
  priority: LoadPriority;
}

export interface OcclusionObject {
  object: THREE.Object3D;
  boundingBox: THREE.Box3;
  boundingSphere: THREE.Sphere;
  visible: boolean;
  lastCheck: number;
}

export interface PerformanceMetrics {
  fps: number;
  memory: number;
  drawCalls: number;
  triangles: number;
}

export interface WorkerTask {
  id: string;
  type: string;
  data: unknown;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

export interface GeometryData {
  attributes: {
    [name: string]: {
      array: TypedArray;
      itemSize: number;
    };
  };
  index: {
    array: TypedArray;
  } | null;
  quantization?: unknown;
}

export interface LoadOptions {
  path: string;
  compress: boolean;
  instanceId?: string | undefined;
  priority: LoadPriority;
  abortController: AbortController;
}
