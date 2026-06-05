// src/workers/worker-utils.ts
// import { logger } from 'utils/logger'; // REMOVED to prevent worker crash
import type { FlowerOptions } from "../lib/ez-tree/environment/flowers";
import type { GrassOptions } from "../lib/ez-tree/environment/grass";
import type { RockOptions as RocksOptions } from "../lib/ez-tree/environment/rocks";
import type { TreesOptions } from "../lib/ez-tree/environment/trees";

const logger = {
  // eslint-disable-next-line no-console
  log: (msg: string) => console.log(msg),
  // eslint-disable-next-line no-console
  warn: (msg: string, err?: unknown) => console.warn(msg, err),
  // eslint-disable-next-line no-console
  error: (msg: string, err?: unknown) => console.error(msg, err),
};

export interface ChunkData {
  grassData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
  rocksData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
  treesData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
  flowersData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
  gameplayData: {
    coinSpawns: { position: number[] }[];
    enemySpawns: { position: number[]; coinIndex: number }[];
  };
}

export interface ChunkWorkerMessage {
  chunkX: number;
  chunkZ: number;
  grassOptions: GrassOptions;
  rocksOptions: RocksOptions;
  treesOptions: TreesOptions;
  flowersOptions: FlowerOptions;
  chunkKey: string;
  worldMin: number;
  worldMax: number;
}

export class OccupancyGrid {
  private grid: boolean[][];
  private size: number;
  private resolution: number;

  constructor(size: number, resolution: number = 2) {
    this.size = size;
    this.resolution = resolution;
    const gridSize = Math.ceil(size * resolution);
    this.grid = new Array(gridSize).fill(false).map(() => new Array(gridSize).fill(false));
  }

  private getKey(localX: number, localZ: number): { x: number; z: number } | null {
    if (localX < 0 || localX >= this.size || localZ < 0 || localZ >= this.size) return null;
    return {
      x: Math.floor(localX * this.resolution),
      z: Math.floor(localZ * this.resolution),
    };
  }

  public isOccupied(localX: number, localZ: number, radius: number): boolean {
    const center = this.getKey(localX, localZ);
    if (!center) return true;

    const radiusCells = Math.ceil(radius * this.resolution);
    const startX = Math.max(0, center.x - radiusCells);
    const endX = Math.min(this.grid.length - 1, center.x + radiusCells);
    const startZ = Math.max(0, center.z - radiusCells);
    const endZ = Math.min(this.grid.length - 1, center.z + radiusCells);

    for (let x = startX; x <= endX; x++) {
      const row = this.grid[x];
      if (row) {
        for (let z = startZ; z <= endZ; z++) {
          if (row[z]) return true;
        }
      }
    }
    return false;
  }

  public markOccupied(localX: number, localZ: number, radius: number): void {
    const center = this.getKey(localX, localZ);
    if (!center) return;

    const radiusCells = Math.ceil(radius * this.resolution);
    const startX = Math.max(0, center.x - radiusCells);
    const endX = Math.min(this.grid.length - 1, center.x + radiusCells);
    const startZ = Math.max(0, center.z - radiusCells);
    const endZ = Math.min(this.grid.length - 1, center.z + radiusCells);

    for (let x = startX; x <= endX; x++) {
      const row = this.grid[x];
      if (row) {
        for (let z = startZ; z <= endZ; z++) {
          row[z] = true;
        }
      }
    }
  }
}

export const performanceMetrics = {
  totalChunksGenerated: 0,
  totalTimeSpent: 0,
  averageTimePerChunk: 0,
};

export function updatePerformanceMetrics(timeSpent: number): void {
  performanceMetrics.totalChunksGenerated++;
  performanceMetrics.totalTimeSpent += timeSpent;
  performanceMetrics.averageTimePerChunk =
    performanceMetrics.totalTimeSpent / performanceMetrics.totalChunksGenerated;

  if (performanceMetrics.totalChunksGenerated % 10 === 0) {
    logger.log(
      `[ChunkWorker] Performance: Generated ${performanceMetrics.totalChunksGenerated} chunks, avg time: ${performanceMetrics.averageTimePerChunk.toFixed(2)}ms`
    );
  }
}

export function cleanupCache(
  generatedChunkData: Map<string, ChunkData>,
  noiseCache: Map<string, number>,
  maxSize: number
): void {
  if (generatedChunkData.size > maxSize) {
    const keysToDelete = Array.from(generatedChunkData.keys()).slice(0, Math.floor(maxSize * 0.3));
    keysToDelete.forEach(key => generatedChunkData.delete(key));
    noiseCache.clear();
    logger.log(`[ChunkWorker] Cleaned up cache. Removed ${keysToDelete.length} entries.`);
  }
}
