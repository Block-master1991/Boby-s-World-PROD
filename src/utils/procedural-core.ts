import { CHUNK_SIZE } from '../lib/chunkUtils';
import RNG from '../lib/ez-tree/rng';

export interface WorldEntity {
  id: string;
  type: 'COIN' | 'ENEMY' | 'TREE' | 'FLOWER' | 'ROCK' | 'GRASS';
  x: number;
  z: number;
}

export class ProceduralCore {
  public static readonly COIN_ZONE_LIMIT = 20;

  private static generateCoins(rng: RNG, chunk: { x: number, z: number, startX: number, startZ: number }): WorldEntity[] {
    const entities: WorldEntity[] = [];
    const isInsideCoinZone = Math.abs(chunk.x) <= this.COIN_ZONE_LIMIT && Math.abs(chunk.z) <= this.COIN_ZONE_LIMIT;
    
    if (isInsideCoinZone && rng.random(0, 1) < 0.625) {
      const worldX = chunk.startX + rng.random(0, CHUNK_SIZE);
      const worldZ = chunk.startZ + rng.random(0, CHUNK_SIZE);

      entities.push({ id: `coin_${chunk.x}_${chunk.z}`, type: 'COIN', x: worldX, z: worldZ });

      // Enemy linked to coin
      rng.random(0, 1); // Maintain RNG state parity
      const angle = rng.random(0, Math.PI * 2);
      const radius = 2 + (rng.random(0, 1) * 6);
      
      entities.push({
        id: `enemy_${chunk.x}_${chunk.z}`,
        type: 'ENEMY',
        x: worldX + Math.cos(angle) * radius,
        z: worldZ + Math.sin(angle) * radius
      });
    }
    return entities;
  }

  private static generateTrees(chunkX: number, chunkZ: number, start: { x: number, z: number }): WorldEntity[] {
    const treeRng = new RNG(chunkX * 30000 + chunkZ);
    const treeCount = Math.floor(treeRng.random(0, 1) * 4);
    const entities: WorldEntity[] = [];

    for (let i = 0; i < treeCount; i++) {
        entities.push({
          id: `tree_${chunkX}_${chunkZ}_${i}`,
          type: 'TREE',
          x: start.x + treeRng.random(0, CHUNK_SIZE),
          z: start.z + treeRng.random(0, CHUNK_SIZE)
        });
    }
    return entities;
  }

  public static generateGameplayEntities(chunkX: number, chunkZ: number): WorldEntity[] {
    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;
    const rng = new RNG(chunkX * 40000 + chunkZ);

    return [
      ...this.generateCoins(rng, { x: chunkX, z: chunkZ, startX: chunkWorldStartX, startZ: chunkWorldStartZ }),
      ...this.generateTrees(chunkX, chunkZ, { x: chunkWorldStartX, z: chunkWorldStartZ }),
    ];
  }
}
