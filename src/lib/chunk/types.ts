import type * as THREE from "three";

export interface ChunkContent {
  id: string; // Unique identifier for the chunk
  grassMesh: THREE.InstancedMesh | null;
  rocksGroup: THREE.Group | null;
  treesGroup: THREE.Group | null;
  flowersGroup: THREE.Group | null;
  objects: THREE.Object3D[]; // Array to hold all Three.js objects in this chunk for easy removal
  isLoaded: boolean; // Track if chunk content is fully loaded and added to scene
  isDisposed: boolean; // Track if chunk resources are disposed
  gameplayData?: {
    coinSpawns: { position: number[] }[];
    enemySpawns: { position: number[]; coinIndex: number }[];
  };
}

export interface ChunkData {
  grassData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  rocksData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  treesData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  flowersData: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  };
  gameplayData: {
    coinSpawns: { position: number[] }[];
    enemySpawns: { position: number[]; coinIndex: number }[];
  };
}

export interface ChunkLoadedEvent extends THREE.BaseEvent {
  type: "chunk-loaded";
  chunkKey: string;
  chunk: ChunkContent;
}

export interface ChunkManagerEventMap extends THREE.Object3DEventMap {
  "chunk-loaded": ChunkLoadedEvent;
}
