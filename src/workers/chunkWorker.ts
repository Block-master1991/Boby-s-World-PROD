// src/workers/chunkWorker.ts
// NOTE: No THREE.js import — it causes Worker crash (DOM dependency)
import { CHUNK_SIZE } from "../lib/chunkUtils";
import type { FlowerOptions, GrassOptions, RockOptions as RocksOptions, TreesOptions } from "../lib/ez-tree/environment/environmentOptions";
import { simplex2dWorker } from "../lib/ez-tree/environment/noiseWorker";
import RNG from "../lib/ez-tree/rng";
import { ProceduralCore } from "../utils/procedural-core";
import type { ChunkData, ChunkWorkerMessage } from "./worker-utils";
import { cleanupCache, OccupancyGrid, updatePerformanceMetrics } from "./worker-utils";

// --- Lightweight math helpers (no THREE.js dependency) ---
function eulerToQuaternion(x: number, y: number, z: number): [number, number, number, number] {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [
    sx * cy * cz - cx * sy * sz, // x
    cx * sy * cz + sx * cy * sz, // y
    cx * cy * sz - sx * sy * cz, // z
    cx * cy * cz + sx * sy * sz, // w
  ];
}

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

  const value = simplex2dWorker(x / scale, y / scale);
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

  const px = worldX + rng.random(-0.5, 0.5);
  const py = 0;
  const pz = worldZ + rng.random(-0.5, 0.5);
  const q = eulerToQuaternion(0, rng.random(0, 2 * Math.PI), 0);
  const sx = opts.sizeVariation.x * rng.random(0, 1) + opts.size.x;
  const sy = opts.sizeVariation.y * rng.random(0, 1) + opts.size.y;
  const sz = opts.sizeVariation.z * rng.random(0, 1) + opts.size.z;
  const cr = 0.25 + rng.random(0, 0.1);
  const cg = 0.3 + rng.random(0, 0.3);
  const cb = 0.1;

  out.positions.push(px, py, pz);
  out.scales.push(sx, sy, sz);
  out.quaternions.push(q[0], q[1], q[2], q[3]);
  out.colors.push(cr, cg, cb);
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
  const px = worldX + rng.random(-1, 1);
  const py = 0;
  const pz = worldZ + rng.random(-1, 1);
  const q = eulerToQuaternion(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2));
  const bScale = opts.size.x + opts.sizeVariation.x * rng.random(0, 1);
  const cr = 0.4 + rng.random(0, 0.1);
  const cg = 0.4 + rng.random(0, 0.1);
  const cb = 0.4 + rng.random(0, 0.1);

  out.positions.push(px, py, pz);
  out.scales.push(bScale, bScale, bScale);
  out.quaternions.push(q[0], q[1], q[2], q[3]);
  out.colors.push(cr, cg, cb);
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
  const px = worldX + rng.random(-2, 2);
  const py = 0;
  const pz = worldZ + rng.random(-2, 2);
  const q = eulerToQuaternion(0, rng.random(0, 2 * Math.PI), 0);
  const treeScale = 0.5 + rng.random(0, 0.5);
  const cr = 0.1 + rng.random(0, 0.1);
  const cg = 0.3 + rng.random(0, 0.2);
  const cb = 0.1;

  out.positions.push(px, py, pz);
  out.scales.push(treeScale, treeScale, treeScale);
  out.quaternions.push(q[0], q[1], q[2], q[3]);
  out.colors.push(cr, cg, cb);
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
  const px = worldX + rng.random(-1, 1);
  const py = 0;
  const pz = worldZ + rng.random(-1, 1);
  const q = eulerToQuaternion(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2));
  const bScale = (opts.size.x + opts.sizeVariation.x * rng.random(0, 1)) / 7;
  const cr = 0.4 + rng.random(0, 0.1);
  const cg = 0.4 + rng.random(0, 0.1);
  const cb = 0.4 + rng.random(0, 0.1);

  out.positions.push(px, py, pz);
  out.scales.push(bScale, bScale, bScale);
  out.quaternions.push(q[0], q[1], q[2], q[3]);
  out.colors.push(cr, cg, cb);
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
