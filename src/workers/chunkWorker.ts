// src/workers/chunkWorker.ts
import * as THREE from "three";
import { CHUNK_SIZE } from "../lib/chunkUtils";
import type { FlowerOptions } from "../lib/ez-tree/environment/flowers";
import type { GrassOptions } from "../lib/ez-tree/environment/grass";
import { simplex2d } from "../lib/ez-tree/environment/noise";
import type { RockOptions as RocksOptions } from "../lib/ez-tree/environment/rocks";
import type { TreesOptions } from "../lib/ez-tree/environment/trees";
import RNG from "../lib/ez-tree/rng";
import { ProceduralCore } from "../utils/procedural-core";
import type { ChunkData, ChunkWorkerMessage } from "./worker-utils";
import { cleanupCache, OccupancyGrid, updatePerformanceMetrics } from "./worker-utils";

const generatedChunkData = new Map<string, ChunkData>();
const noiseCache = new Map<string, number>();

const MAX_NOISE_CACHE_SIZE = 15000;

function getCachedNoise(x: number, y: number, scale: number): number {
  const key = `${x}_${y}_${scale}`;
  const cachedValue = noiseCache.get(key);

  if (cachedValue !== undefined) {
    // Simple LRU: move to end of map
    noiseCache.delete(key);
    noiseCache.set(key, cachedValue);
    return cachedValue;
  }

  const value = simplex2d(new THREE.Vector2(x / scale, y / scale));
  noiseCache.set(key, value);

  // Evict oldest entries if cache is too large
  if (noiseCache.size > MAX_NOISE_CACHE_SIZE) {
    const firstKey = noiseCache.keys().next().value;
    if (firstKey !== undefined) noiseCache.delete(firstKey);
  }
  return value;
}

interface GenOptions {
  chunkX: number;
  chunkZ: number;
  worldMin: number;
  worldMax: number;
  grid: OccupancyGrid;
}

interface InstanceData {
  positions: number[];
  scales: number[];
  quaternions: number[];
  colors: number[];
}

function processGrass(params: {
  rng: RNG;
  startX: number;
  startZ: number;
  opts: GrassOptions;
  env: GenOptions;
  out: InstanceData;
}) {
  const { rng, startX, startZ, opts, env, out } = params;
  const localX = rng.random(0, CHUNK_SIZE);
  const localZ = rng.random(0, CHUNK_SIZE);
  const worldX = startX + localX;
  const worldZ = startZ + localZ;

  if (
    worldX < env.worldMin ||
    worldX > env.worldMax ||
    worldZ < env.worldMin ||
    worldZ > env.worldMax
  )
    return;
  const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
  if (n > opts.patchiness - 0.05 || env.grid.isOccupied(localX, localZ, 0.2)) return;

  const position = new THREE.Vector3(
    worldX + rng.random(-0.5, 0.5),
    0,
    worldZ + rng.random(-0.5, 0.5)
  );
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0)
  );
  const scale = new THREE.Vector3(
    opts.sizeVariation.x * rng.random(0, 1) + opts.size.x,
    opts.sizeVariation.y * rng.random(0, 1) + opts.size.y,
    opts.sizeVariation.z * rng.random(0, 1) + opts.size.z
  );
  const color = new THREE.Color(0.25 + rng.random(0, 0.1), 0.3 + rng.random(0, 0.3), 0.1);

  out.positions.push(position.x, position.y, position.z);
  out.scales.push(scale.x, scale.y, scale.z);
  out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  out.colors.push(color.r, color.g, color.b);
}

function generateGrassData(opts: GrassOptions, env: GenOptions) {
  const out = {
    positions: [] as number[],
    scales: [] as number[],
    quaternions: [] as number[],
    colors: [] as number[],
  };
  const rng = new RNG(env.chunkX * 10000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.instanceCountPerChunk; i++) {
    processGrass({ rng, startX, startZ, opts, env, out });
  }
  return out;
}

function processRock(params: {
  rng: RNG;
  startX: number;
  startZ: number;
  opts: RocksOptions;
  env: GenOptions;
  out: InstanceData;
}) {
  const { rng, startX, startZ, opts, env, out } = params;
  const localX = rng.random(0, CHUNK_SIZE);
  const localZ = rng.random(0, CHUNK_SIZE);
  const worldX = startX + localX;
  const worldZ = startZ + localZ;

  if (
    worldX < env.worldMin ||
    worldX > env.worldMax ||
    worldZ < env.worldMin ||
    worldZ > env.worldMax
  )
    return;
  const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
  if (n < opts.patchiness + 0.05 || env.grid.isOccupied(localX, localZ, 1.0)) return;

  env.grid.markOccupied(localX, localZ, 1.0);
  const position = new THREE.Vector3(worldX + rng.random(-1, 1), 0, worldZ + rng.random(-1, 1));
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2))
  );
  const bScale = opts.size.x + opts.sizeVariation.x * rng.random(0, 1);
  const scale = new THREE.Vector3(bScale, bScale, bScale);
  const color = new THREE.Color(
    0.4 + rng.random(0, 0.1),
    0.4 + rng.random(0, 0.1),
    0.4 + rng.random(0, 0.1)
  );

  out.positions.push(position.x, position.y, position.z);
  out.scales.push(scale.x, scale.y, scale.z);
  out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  out.colors.push(color.r, color.g, color.b);
}

function generateRockData(opts: RocksOptions, env: GenOptions) {
  const out = {
    positions: [] as number[],
    scales: [] as number[],
    quaternions: [] as number[],
    colors: [] as number[],
  };
  const rng = new RNG(env.chunkX * 20000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.rockCountPerChunk; i++) {
    processRock({ rng, startX, startZ, opts, env, out });
  }
  return out;
}

function processTree(params: {
  rng: RNG;
  startX: number;
  startZ: number;
  opts: TreesOptions;
  env: GenOptions;
  out: InstanceData;
}) {
  const { rng, startX, startZ, opts, env, out } = params;
  const localX = rng.random(0, CHUNK_SIZE);
  const localZ = rng.random(0, CHUNK_SIZE);
  const worldX = startX + localX;
  const worldZ = startZ + localZ;

  if (
    worldX < env.worldMin ||
    worldX > env.worldMax ||
    worldZ < env.worldMin ||
    worldZ > env.worldMax
  )
    return;
  const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
  if (n > opts.patchiness - 0.05 || env.grid.isOccupied(localX, localZ, 1.5)) return;

  env.grid.markOccupied(localX, localZ, 1.5);
  const position = new THREE.Vector3(worldX + rng.random(-2, 2), 0, worldZ + rng.random(-2, 2));
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0)
  );
  const treeScale = 0.5 + rng.random(0, 0.5);
  const scale = new THREE.Vector3(treeScale, treeScale, treeScale);
  const color = new THREE.Color(0.1 + rng.random(0, 0.1), 0.3 + rng.random(0, 0.2), 0.1);

  out.positions.push(position.x, position.y, position.z);
  out.scales.push(scale.x, scale.y, scale.z);
  out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  out.colors.push(color.r, color.g, color.b);
}

function generateTreeData(opts: TreesOptions, env: GenOptions) {
  const out = {
    positions: [] as number[],
    scales: [] as number[],
    quaternions: [] as number[],
    colors: [] as number[],
  };
  const rng = new RNG(env.chunkX * 30000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.treeCountPerChunk; i++) {
    processTree({ rng, startX, startZ, opts, env, out });
  }
  return out;
}

function processFlower(params: {
  rng: RNG;
  startX: number;
  startZ: number;
  opts: FlowerOptions;
  env: GenOptions;
  out: InstanceData;
}) {
  const { rng, startX, startZ, opts, env, out } = params;
  const localX = rng.random(0, CHUNK_SIZE);
  const localZ = rng.random(0, CHUNK_SIZE);
  const worldX = startX + localX;
  const worldZ = startZ + localZ;

  if (
    worldX < env.worldMin ||
    worldX > env.worldMax ||
    worldZ < env.worldMin ||
    worldZ > env.worldMax
  )
    return;
  if (
    0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale) > opts.patchiness - 0.05 ||
    env.grid.isOccupied(localX, localZ, 0.3)
  )
    return;

  env.grid.markOccupied(localX, localZ, 0.3);
  const position = new THREE.Vector3(worldX + rng.random(-1, 1), 0, worldZ + rng.random(-1, 1));
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2))
  );
  const bScale = (opts.size.x + opts.sizeVariation.x * rng.random(0, 1)) / 7;
  const scale = new THREE.Vector3(bScale, bScale, bScale);
  const color = new THREE.Color(
    0.4 + rng.random(0, 0.1),
    0.4 + rng.random(0, 0.1),
    0.4 + rng.random(0, 0.1)
  );

  out.positions.push(position.x, position.y, position.z);
  out.scales.push(scale.x, scale.y, scale.z);
  out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  out.colors.push(color.r, color.g, color.b);
}

function generateFlowerData(opts: FlowerOptions, env: GenOptions) {
  const out = {
    positions: [] as number[],
    scales: [] as number[],
    quaternions: [] as number[],
    colors: [] as number[],
  };
  const rng = new RNG(env.chunkX * 20000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.flowersCountPerChunk; i++) {
    processFlower({ rng, startX, startZ, opts, env, out });
  }
  return out;
}

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
