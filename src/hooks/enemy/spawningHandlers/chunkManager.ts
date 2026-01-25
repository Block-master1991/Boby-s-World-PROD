import { getChunkKey, RENDER_DISTANCE_CHUNKS } from '@/lib/chunkUtils';
import type * as THREE from 'three';

interface ChunkManager {
  getGameplaySpawns: (key: string) => {
    coinSpawns: Array<{ position: number[] }>;
    enemySpawns: Array<{ coinIndex: number; position: number[] }>;
  } | undefined;
}

export const getNearKeys = (cx: number, cz: number): Set<string> => {
  const s = new Set<string>();
  for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
    for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
      s.add(getChunkKey(cx + x, cz + z));
    }
  }
  return s;
};

export const parseKey = (k: string): { cx: number; cz: number } => {
  const parts = k.split(',');
  return {
    cx: parseInt(parts[0] ?? '0', 10),
    cz: parseInt(parts[1] ?? '0', 10)
  };
};

export const getChunkManager = (scene: THREE.Scene | null): ChunkManager | null => {
  const obj = scene?.getObjectByName('ChunkManager');
  if (!obj) return null;
  return obj as unknown as ChunkManager;
};
