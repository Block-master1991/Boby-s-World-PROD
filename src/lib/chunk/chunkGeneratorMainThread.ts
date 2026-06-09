/**
 * Main-thread fallback for chunk generation
 * Used when the Web Worker fails to load (common in Next.js dev mode)
 */
import * as THREE from "three";
import { ProceduralCore } from "../../utils/procedural-core";
import type { ChunkData } from "../../workers/worker-utils";
import { OccupancyGrid } from "../../workers/worker-utils";
import { CHUNK_SIZE } from "../chunkUtils";
import { WORLD_MAX_BOUND, WORLD_MIN_BOUND } from "../constants";
import type { FlowerOptions, GrassOptions, RockOptions as RocksOptions, TreesOptions } from "../world-generation/environment-generator/environmentOptions";
import { simplex2d } from "../world-generation/environment-generator/noise";
import RNG from "../world-generation/rng";

// Noise cache for main-thread generation
const noiseCache = new Map<string, number>();
const MAX_NOISE_CACHE_SIZE = 15000;

function getCachedNoise(x: number, y: number, scale: number): number {
  const key = `${x}_${y}_${scale}`;
  const cachedValue = noiseCache.get(key);
  if (cachedValue !== undefined) {
    noiseCache.delete(key);
    noiseCache.set(key, cachedValue);
    return cachedValue;
  }
  const value = simplex2d(new THREE.Vector2(x / scale, y / scale));
  noiseCache.set(key, value);
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

function generateGrassData(opts: GrassOptions, env: GenOptions): InstanceData {
  const out: InstanceData = { positions: [], scales: [], quaternions: [], colors: [] };
  const rng = new RNG(env.chunkX * 10000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.instanceCountPerChunk; i++) {
    const localX = rng.random(0, CHUNK_SIZE);
    const localZ = rng.random(0, CHUNK_SIZE);
    const worldX = startX + localX;
    const worldZ = startZ + localZ;
    if (worldX < env.worldMin || worldX > env.worldMax || worldZ < env.worldMin || worldZ > env.worldMax) continue;
    const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
    if (n > opts.patchiness - 0.05 || env.grid.isOccupied(localX, localZ, 0.2)) continue;

    const position = new THREE.Vector3(worldX + rng.random(-0.5, 0.5), 0, worldZ + rng.random(-0.5, 0.5));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0));
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
  return out;
}

function generateRockData(opts: RocksOptions, env: GenOptions): InstanceData {
  const out: InstanceData = { positions: [], scales: [], quaternions: [], colors: [] };
  const rng = new RNG(env.chunkX * 20000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.rockCountPerChunk; i++) {
    const localX = rng.random(0, CHUNK_SIZE);
    const localZ = rng.random(0, CHUNK_SIZE);
    const worldX = startX + localX;
    const worldZ = startZ + localZ;
    if (worldX < env.worldMin || worldX > env.worldMax || worldZ < env.worldMin || worldZ > env.worldMax) continue;
    const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
    if (n < opts.patchiness + 0.05 || env.grid.isOccupied(localX, localZ, 1.0)) continue;

    env.grid.markOccupied(localX, localZ, 1.0);
    const position = new THREE.Vector3(worldX + rng.random(-1, 1), 0, worldZ + rng.random(-1, 1));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2)));
    const bScale = opts.size.x + opts.sizeVariation.x * rng.random(0, 1);
    const scale = new THREE.Vector3(bScale, bScale, bScale);
    const color = new THREE.Color(0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1));
    out.positions.push(position.x, position.y, position.z);
    out.scales.push(scale.x, scale.y, scale.z);
    out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    out.colors.push(color.r, color.g, color.b);
  }
  return out;
}

function generateTreeData(opts: TreesOptions, env: GenOptions): InstanceData {
  const out: InstanceData = { positions: [], scales: [], quaternions: [], colors: [] };
  const rng = new RNG(env.chunkX * 30000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.treeCountPerChunk; i++) {
    const localX = rng.random(0, CHUNK_SIZE);
    const localZ = rng.random(0, CHUNK_SIZE);
    const worldX = startX + localX;
    const worldZ = startZ + localZ;
    if (worldX < env.worldMin || worldX > env.worldMax || worldZ < env.worldMin || worldZ > env.worldMax) continue;
    const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale);
    if (n > opts.patchiness - 0.05 || env.grid.isOccupied(localX, localZ, 1.5)) continue;

    env.grid.markOccupied(localX, localZ, 1.5);
    const position = new THREE.Vector3(worldX + rng.random(-2, 2), 0, worldZ + rng.random(-2, 2));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0));
    const treeScale = 0.5 + rng.random(0, 0.5);
    const scale = new THREE.Vector3(treeScale, treeScale, treeScale);
    const color = new THREE.Color(0.1 + rng.random(0, 0.1), 0.3 + rng.random(0, 0.2), 0.1);
    out.positions.push(position.x, position.y, position.z);
    out.scales.push(scale.x, scale.y, scale.z);
    out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    out.colors.push(color.r, color.g, color.b);
  }
  return out;
}

function generateFlowerData(opts: FlowerOptions, env: GenOptions): InstanceData {
  const out: InstanceData = { positions: [], scales: [], quaternions: [], colors: [] };
  const rng = new RNG(env.chunkX * 20000 + env.chunkZ);
  const startX = env.chunkX * CHUNK_SIZE;
  const startZ = env.chunkZ * CHUNK_SIZE;

  for (let i = 0; i < opts.flowersCountPerChunk; i++) {
    const localX = rng.random(0, CHUNK_SIZE);
    const localZ = rng.random(0, CHUNK_SIZE);
    const worldX = startX + localX;
    const worldZ = startZ + localZ;
    if (worldX < env.worldMin || worldX > env.worldMax || worldZ < env.worldMin || worldZ > env.worldMax) continue;
    if (0.5 + 0.5 * getCachedNoise(worldX, worldZ, opts.scale) > opts.patchiness - 0.05 || env.grid.isOccupied(localX, localZ, 0.3)) continue;

    env.grid.markOccupied(localX, localZ, 0.3);
    const position = new THREE.Vector3(worldX + rng.random(-1, 1), 0, worldZ + rng.random(-1, 1));
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.random(0, 0.2), rng.random(0, 2 * Math.PI), rng.random(0, 0.2)));
    const bScale = (opts.size.x + opts.sizeVariation.x * rng.random(0, 1)) / 7;
    const scale = new THREE.Vector3(bScale, bScale, bScale);
    const color = new THREE.Color(0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1));
    out.positions.push(position.x, position.y, position.z);
    out.scales.push(scale.x, scale.y, scale.z);
    out.quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    out.colors.push(color.r, color.g, color.b);
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

/**
 * Generate chunk data on the main thread (fallback when Worker fails)
 */
export function generateChunkDataMainThread(
  chunkX: number,
  chunkZ: number,
  grassOptions: GrassOptions,
  rocksOptions: RocksOptions,
  treesOptions: TreesOptions,
  flowersOptions: FlowerOptions,
): ChunkData {
  const env: GenOptions = {
    chunkX,
    chunkZ,
    worldMin: WORLD_MIN_BOUND,
    worldMax: WORLD_MAX_BOUND,
    grid: new OccupancyGrid(CHUNK_SIZE, 2),
  };

  return {
    treesData: generateTreeData(treesOptions, env),
    rocksData: generateRockData(rocksOptions, env),
    gameplayData: generateGameplayData(chunkX, chunkZ),
    flowersData: generateFlowerData(flowersOptions, env),
    grassData: generateGrassData(grassOptions, env),
  };
}
