// src/workers/chunkWorker.ts
// NOTE: No THREE.js import — it causes Worker crash (DOM dependency)
import { CHUNK_SIZE } from "../lib/chunkUtils";
import { ProceduralCore } from "../utils/procedural-core";
import type { ChunkData, ChunkWorkerMessage } from "./worker-utils";
import { cleanupCache, OccupancyGrid, updatePerformanceMetrics } from "./worker-utils";
import {
  generateGrassData,
  generateRockData,
  generateTreeData,
  generateFlowerData,
  noiseCache,
} from "./chunkVegetationGenerators";

const generatedChunkData = new Map<string, ChunkData>();

function generateGameplayData(chunkX: number, chunkZ: number) {
  const coinSpawns: { position: number[] }[] = [];
  const enemySpawns: { position: number[]; coinIndex: number }[] = [];
  ProceduralCore.generateGameplayEntities(chunkX, chunkZ).forEach(entity => {
    if (entity.type === "COIN") coinSpawns.push({ position: [entity.x, 0, entity.z] });
    else if (entity.type === "ENEMY")
      enemySpawns.push({ position: [entity.x, 0, entity.z], coinIndex: coinSpawns.length - 1 });
  });
  return { coinSpawns, enemySpawns };
}

function handleMessage(data: ChunkWorkerMessage) {
  const startTime = performance.now();
  if (generatedChunkData.has(data.chunkKey)) {
    self.postMessage({ chunkKey: data.chunkKey, ...generatedChunkData.get(data.chunkKey) });
    return;
  }

  const env = { ...data, grid: new OccupancyGrid(CHUNK_SIZE, 2) };
  const chunkData = {
    treesData: generateTreeData(data.treesOptions, env),
    rocksData: generateRockData(data.rocksOptions, env),
    gameplayData: generateGameplayData(data.chunkX, data.chunkZ),
    flowersData: generateFlowerData(data.flowersOptions, env),
    grassData: generateGrassData(data.grassOptions, env),
  };

  generatedChunkData.set(data.chunkKey, chunkData);
  cleanupCache(generatedChunkData, noiseCache, 100);
  updatePerformanceMetrics(performance.now() - startTime);
  self.postMessage({ chunkKey: data.chunkKey, ...chunkData });
}

self.onmessage = e => handleMessage(e.data);
