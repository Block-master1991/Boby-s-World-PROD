// src/workers/chunkWorker.ts
import * as THREE from 'three';
import { simplex2d } from '../lib/ez-tree/environment/noise';
import { CHUNK_SIZE } from '../lib/chunkUtils';
import { GrassOptions } from '../lib/ez-tree/environment/grass';
import { RockOptions as RocksOptions } from '../lib/ez-tree/environment/rocks';
import { TreesOptions } from '../lib/ez-tree/environment/trees';
import { FlowerOptions } from '../lib/ez-tree/environment/flowers';
import RNG from '../lib/ez-tree/rng';

// Keep track of generated chunk data to avoid re-computation
export interface ChunkData {
    grassData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
    rocksData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
    treesData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
    flowersData: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] };
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

const generatedChunkData = new Map<string, ChunkData>();

// Cache for noise calculations to improve performance
const noiseCache = new Map<string, number>();

// Function to get noise value with caching
function getCachedNoise(x: number, y: number, scale: number): number {
    const key = `${x}_${y}_${scale}`;
    if (noiseCache.has(key)) {
        return noiseCache.get(key) as number;
    }

    const value = simplex2d(new THREE.Vector2(x / scale, y / scale));
    noiseCache.set(key, value);

    // Limit cache size to prevent memory issues
    if (noiseCache.size > 10000) {
        // Clear oldest entries (simplified approach)
        const keysToDelete = Array.from(noiseCache.keys()).slice(0, 1000);
        keysToDelete.forEach(key => noiseCache.delete(key));
    }

    return value;
}

// Function to get multi-octave noise
function getMultiOctaveNoise(x: number, z: number, baseScale: number, octaves: number, persistence: number, lacunarity: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0; // Used for normalizing result to 0.0 - 1.0

    for (let i = 0; i < octaves; i++) {
        total += simplex2d(new THREE.Vector2(x / baseScale * frequency, z / baseScale * frequency)) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    return total / maxValue; // Normalize
}

function generateGrassData(chunkX: number, chunkZ: number, options: GrassOptions, worldMin: number, worldMax: number) {
    const positions = [];
    const scales = [];
    const quaternions = [];
    const colors = [];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    // Use a seed based on chunk coordinates for consistent generation
    const seed = chunkX * 10000 + chunkZ;
    const rng = new RNG(seed); // Use the new RNG

    for (let i = 0; i < options.instanceCountPerChunk; i++) {
        const localX = rng.random(0, CHUNK_SIZE);
        const localZ = rng.random(0, CHUNK_SIZE);

        const worldX = chunkWorldStartX + localX;
        const worldZ = chunkWorldStartZ + localZ;

        // Skip if outside world bounds
        if (worldX < worldMin || worldX > worldMax || worldZ < worldMin || worldZ > worldMax) {
            continue;
        }

        // Use multi-octave noise for more natural distribution
        const n = 0.5 + 0.5 * getMultiOctaveNoise(worldX, worldZ, options.scale, 3, 0.5, 2); // 3 octaves, persistence 0.5, lacunarity 2

        if (n < options.patchiness && rng.random(0, 1) > options.patchiness) { // Invert condition for patchiness
            continue;
        }

        // Add jittering
        const jitterX = rng.random(-0.5, 0.5);
        const jitterZ = rng.random(-0.5, 0.5);

        const position = new THREE.Vector3(worldX + jitterX, 0, worldZ + jitterZ);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0));
        const scale = new THREE.Vector3(
            options.sizeVariation.x * rng.random(0, 1) + options.size.x,
            options.sizeVariation.y * rng.random(0, 1) + options.size.y,
            options.sizeVariation.z * rng.random(0, 1) + options.size.z
        );
        const color = new THREE.Color(0.25 + rng.random(0, 0.1), 0.3 + rng.random(0, 0.3), 0.1);

        positions.push(position.x, position.y, position.z);
        scales.push(scale.x, scale.y, scale.z);
        quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        colors.push(color.r, color.g, color.b);
    }
    return { positions, scales, quaternions, colors };
}


function generateRockData(chunkX: number, chunkZ: number, options: RocksOptions, worldMin: number, worldMax: number): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {
    const positions = [];
    const scales = [];
    const quaternions = [];
    const colors = [];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    // Use a seed based on chunk coordinates for consistent generation
    const seed = chunkX * 20000 + chunkZ;
    const rng = new RNG(seed); // Use the new RNG

    for (let i = 0; i < options.rockCountPerChunk; i++) {
        const localX = rng.random(0, CHUNK_SIZE);
        const localZ = rng.random(0, CHUNK_SIZE);

        const worldX = chunkWorldStartX + localX;
        const worldZ = chunkWorldStartZ + localZ;

        // Skip if outside world bounds
        if (worldX < worldMin || worldX > worldMax || worldZ < worldMin || worldZ > worldMax) {
            continue;
        }

        // Use multi-octave noise for rock placement
        const n = 0.5 + 0.5 * getMultiOctaveNoise(worldX, worldZ, options.scale, 3, 0.5, 2);

        if (n < options.patchiness && rng.random(0, 1) > options.patchiness) {
            continue;
        }

        // Add jittering
        const jitterX = rng.random(-1, 1);
        const jitterZ = rng.random(-1, 1);

        const position = new THREE.Vector3(worldX + jitterX, 0, worldZ + jitterZ);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            rng.random(0, 0.2),
            rng.random(0, 2 * Math.PI),
            rng.random(0, 0.2)
        ));
        const baseScale = options.size.x + options.sizeVariation.x * rng.random(0, 1);
        const scale = new THREE.Vector3(baseScale, baseScale, baseScale);
        const color = new THREE.Color(0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1));

        positions.push(position.x, position.y, position.z);
        scales.push(scale.x, scale.y, scale.z);
        quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        colors.push(color.r, color.g, color.b);
    }

    return { positions, scales, quaternions, colors };
}

function generateTreeData(chunkX: number, chunkZ: number, options: TreesOptions, worldMin: number, worldMax: number): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {
    const positions = [];
    const scales = [];
    const quaternions = [];
    const colors = [];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    // Use a seed based on chunk coordinates for consistent generation
    const seed = chunkX * 30000 + chunkZ;
    const rng = new RNG(seed); // Use the new RNG

    for (let i = 0; i < options.treeCountPerChunk; i++) {
        const localX = rng.random(0, CHUNK_SIZE);
        const localZ = rng.random(0, CHUNK_SIZE);

        const worldX = chunkWorldStartX + localX;
        const worldZ = chunkWorldStartZ + localZ;

        // Skip if outside world bounds
        if (worldX < worldMin || worldX > worldMax || worldZ < worldMin || worldZ > worldMax) {
            continue;
        }

        // Use multi-octave noise for tree placement
        const n = 0.5 + 0.5 * getMultiOctaveNoise(worldX, worldZ, options.scale, 3, 0.5, 2);

        if (n < options.patchiness && rng.random(0, 1) > options.patchiness) {
            continue;
        }

        // Add jittering
        const jitterX = rng.random(-2, 2);
        const jitterZ = rng.random(-2, 2);

        const position = new THREE.Vector3(worldX + jitterX, 0, worldZ + jitterZ);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng.random(0, 2 * Math.PI), 0));
        // Randomize tree scale (similar to Trees class)
        const treeScale = 0.5 + rng.random(0, 0.5);
        const scale = new THREE.Vector3(treeScale, treeScale, treeScale);
        const color = new THREE.Color(0.1 + rng.random(0, 0.1), 0.3 + rng.random(0, 0.2), 0.1);

        positions.push(position.x, position.y, position.z);
        scales.push(scale.x, scale.y, scale.z);
        quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        colors.push(color.r, color.g, color.b);
    }

    return { positions, scales, quaternions, colors };
}

function generateFlowerData(chunkX: number, chunkZ: number, options: FlowerOptions, worldMin: number, worldMax: number): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {

    const positions = [];
    const scales = [];
    const quaternions = [];
    const colors = [];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    // Use a seed based on chunk coordinates for consistent generation
    const seed = chunkX * 20000 + chunkZ;
    const rng = new RNG(seed); // Use the new RNG

    for (let i = 0; i < options.flowersCountPerChunk; i++) {
        const localX = rng.random(0, CHUNK_SIZE);
        const localZ = rng.random(0, CHUNK_SIZE);

        const worldX = chunkWorldStartX + localX;
        const worldZ = chunkWorldStartZ + localZ;

        // Skip if outside world bounds
        if (worldX < worldMin || worldX > worldMax || worldZ < worldMin || worldZ > worldMax) {
            continue;
        }

        // Use multi-octave noise for rock placement
        const n = 0.5 + 0.5 * getMultiOctaveNoise(worldX, worldZ, options.scale, 3, 0.5, 2);

        if (n < options.patchiness && rng.random(0, 1) > options.patchiness) {
            continue;
        }

        // Add jittering
        const jitterX = rng.random(-1, 1);
        const jitterZ = rng.random(-1, 1);

        const position = new THREE.Vector3(worldX + jitterX, 0, worldZ + jitterZ);
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            rng.random(0, 0.2),
            rng.random(0, 2 * Math.PI),
            rng.random(0, 0.2)
        ));
        // تصغير الحجم إلى ثلاثة أضعاف
        const baseScale = (options.size.x + options.sizeVariation.x * rng.random(0, 1)) / 7;
        const scale = new THREE.Vector3(baseScale, baseScale, baseScale);
        const color = new THREE.Color(0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1), 0.4 + rng.random(0, 0.1));

        positions.push(position.x, position.y, position.z);
        scales.push(scale.x, scale.y, scale.z);
        quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        colors.push(color.r, color.g, color.b);
    }

    return { positions, scales, quaternions, colors };
}


// Performance monitoring
const performanceMetrics = {
    totalChunksGenerated: 0,
    totalTimeSpent: 0,
    averageTimePerChunk: 0
};

// Limit cache size to prevent memory issues
const MAX_CACHE_SIZE = 100;

// Function to clean up cache when it gets too large
function cleanupCache() {
    if (generatedChunkData.size > MAX_CACHE_SIZE) {
        // Simple strategy: remove oldest entries
        const keysToDelete = Array.from(generatedChunkData.keys()).slice(0, Math.floor(MAX_CACHE_SIZE * 0.3));
        keysToDelete.forEach(key => generatedChunkData.delete(key));

        // Also clean up noise cache
        noiseCache.clear();

        console.log(`[ChunkWorker] Cleaned up cache. Removed ${keysToDelete.length} entries.`);
    }
}

self.onmessage = (e) => {
    const startTime = performance.now();
    const { chunkX, chunkZ, grassOptions, rocksOptions, treesOptions, flowersOptions, chunkKey, worldMin, worldMax } = e.data;

    // Check cache first
    if (generatedChunkData.has(chunkKey)) {
        const cachedData = generatedChunkData.get(chunkKey);
        self.postMessage({ chunkKey, ...cachedData });
        return;
    }

    // Generate chunk data
    const grassData = generateGrassData(chunkX, chunkZ, grassOptions, worldMin, worldMax);
    const rocksData = generateRockData(chunkX, chunkZ, rocksOptions, worldMin, worldMax);
    const treesData = generateTreeData(chunkX, chunkZ, treesOptions, worldMin, worldMax);
    const flowersData = generateFlowerData(chunkX, chunkZ, flowersOptions, worldMin, worldMax);

    const chunkData = {
        grassData,
        rocksData,
        treesData,
        flowersData,
    };

    // Store in cache
    generatedChunkData.set(chunkKey, chunkData);

    // Clean up cache if needed
    cleanupCache();

    // Update performance metrics
    const endTime = performance.now();
    const timeSpent = endTime - startTime;
    performanceMetrics.totalChunksGenerated++;
    performanceMetrics.totalTimeSpent += timeSpent;
    performanceMetrics.averageTimePerChunk = performanceMetrics.totalTimeSpent / performanceMetrics.totalChunksGenerated;

    // Log performance metrics periodically
    if (performanceMetrics.totalChunksGenerated % 10 === 0) {
        console.log(`[ChunkWorker] Performance: Generated ${performanceMetrics.totalChunksGenerated} chunks, avg time: ${performanceMetrics.averageTimePerChunk.toFixed(2)}ms`);
    }

    // Send response
    self.postMessage({
        chunkKey,
        ...chunkData
    });
};
