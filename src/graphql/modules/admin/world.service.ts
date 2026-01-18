import type { WorldEntity } from '@/utils/procedural-core';
import { ProceduralCore } from '@/utils/procedural-core';

export interface WorldChunk {
  x: number;
  z: number;
  terrainType: string;
  objects: WorldEntity[];
}

export class WorldService {
  private static chunkCache = new Map<string, { data: WorldChunk, timestamp: number }>();
  private static readonly TTL = 300000; // 5 minutes

  /**
   * Simple deterministic terrain type based on seed
   */
  private static getTerrainType(x: number, z: number): string {
    const seed = x * 10000 + z;
    const val = Math.abs(Math.sin(seed) * 1000) % 1;
    const types = ['GRASS', 'DIRT', 'SAND', 'FOREST'];
    return types[Math.floor(val * types.length)] || 'GRASS';
  }

  static getChunks(chunkX: number, chunkZ: number, radius: number = 1): WorldChunk[] {
    const now = Date.now();
    const chunks: WorldChunk[] = [];

    for (let x = chunkX - radius; x <= chunkX + radius; x++) {
      for (let z = chunkZ - radius; z <= chunkZ + radius; z++) {
        const key = `${x},${z}`;
        const cached = this.chunkCache.get(key);

        if (cached && (now - cached.timestamp < this.TTL)) {
          chunks.push(cached.data);
          continue;
        }

        const newChunk: WorldChunk = { 
          x, 
          z, 
          terrainType: this.getTerrainType(x, z), 
          objects: ProceduralCore.generateGameplayEntities(x, z) 
        };
        
        this.chunkCache.set(key, { data: newChunk, timestamp: now });
        chunks.push(newChunk);
      }
    }

    return chunks;
  }
}
