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

class OccupancyGrid {
    private grid: boolean[][];
    private size: number;
    private resolution: number; // cells per unit

    constructor(size: number, resolution: number = 2) {
        this.size = size;
        this.resolution = resolution;
        const gridSize = Math.ceil(size * resolution);
        this.grid = new Array(gridSize).fill(false).map(() => new Array(gridSize).fill(false));
    }

    private getKey(localX: number, localZ: number): { x: number, z: number } | null {
        if (localX < 0 || localX >= this.size || localZ < 0 || localZ >= this.size) return null;
        return {
            x: Math.floor(localX * this.resolution),
            z: Math.floor(localZ * this.resolution)
        };
    }

    isOccupied(localX: number, localZ: number, radius: number): boolean {
        const center = this.getKey(localX, localZ);
        if (!center) return true; // Treat out of bounds as occupied to be safe

        const radiusCells = Math.ceil(radius * this.resolution);
        const startX = Math.max(0, center.x - radiusCells);
        const endX = Math.min(this.grid.length - 1, center.x + radiusCells);
        const startZ = Math.max(0, center.z - radiusCells);
        const endZ = Math.min(this.grid.length - 1, center.z + radiusCells);

        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                if (this.grid[x][z]) return true;
            }
        }
        return false;
    }

    markOccupied(localX: number, localZ: number, radius: number): void {
        const center = this.getKey(localX, localZ);
        if (!center) return;

        const radiusCells = Math.ceil(radius * this.resolution);
        const startX = Math.max(0, center.x - radiusCells);
        const endX = Math.min(this.grid.length - 1, center.x + radiusCells);
        const startZ = Math.max(0, center.z - radiusCells);
        const endZ = Math.min(this.grid.length - 1, center.z + radiusCells);

        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                this.grid[x][z] = true;
            }
        }
    }
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

function generateGrassData(chunkX: number, chunkZ: number, options: GrassOptions, worldMin: number, worldMax: number, grid: OccupancyGrid) {
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

        // Use standard simplex noise to match ground shader
        const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, options.scale);

        if (n > options.patchiness - 0.05) { // Skip if noise is growing towards Dirt (Buffer zone for Grass)
            continue;
        }

        // Check for overlap
        if (grid.isOccupied(localX, localZ, 0.2)) {
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


function generateRockData(chunkX: number, chunkZ: number, options: RocksOptions, worldMin: number, worldMax: number, grid: OccupancyGrid): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {
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

        // Use standard simplex noise to match ground shader
        const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, options.scale);

        if (n < options.patchiness + 0.05) { // Skip if noise is low (Grass + Buffer zone)
            continue;
        }

        // Check for overlap (allow some overlap for rocks with other rocks, but generally check)
        // Rocks reserve space
        if (grid.isOccupied(localX, localZ, 1.0)) {
            continue;
        }
        grid.markOccupied(localX, localZ, 1.0);

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

function generateTreeData(chunkX: number, chunkZ: number, options: TreesOptions, worldMin: number, worldMax: number, grid: OccupancyGrid): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {
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

        // Use standard simplex noise to match ground shader
        const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, options.scale);

        if (n > options.patchiness - 0.05) { // Skip if noise is high (Buffer zone for Trees)
            continue;
        }

        // Trees reserve a large space
        if (grid.isOccupied(localX, localZ, 1.5)) {
            continue;
        }
        grid.markOccupied(localX, localZ, 1.5);

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

function generateFlowerData(chunkX: number, chunkZ: number, options: FlowerOptions, worldMin: number, worldMax: number, grid: OccupancyGrid): { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] } {

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

        // Use standard simplex noise to match ground shader
        const n = 0.5 + 0.5 * getCachedNoise(worldX, worldZ, options.scale);

        if (n > options.patchiness - 0.05) { // Skip if noise is high (Buffer zone for Flowers)
            continue;
        }

        // Check occupancy
        if (grid.isOccupied(localX, localZ, 0.3)) {
            continue;
        }
        // Flowers occupy space for other flowers/grass
        grid.markOccupied(localX, localZ, 0.3);

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


function generateGameplayData(chunkX: number, chunkZ: number, worldMin: number, worldMax: number, grid: OccupancyGrid): { coinSpawns: { position: number[] }[]; enemySpawns: { position: number[]; coinIndex: number }[] } {
    const coinSpawns: { position: number[] }[] = [];
    const enemySpawns: { position: number[]; coinIndex: number }[] = [];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    // Use a seed based on chunk coordinates for consistent generation
    const seed = chunkX * 40000 + chunkZ;
    const rng = new RNG(seed);

    // --- COINS GENERATION ---
    // Deterministic Coin Zone: Only spawn in central chunks (-20 to 20)
    // This creates a ~2000m x 2000m area with a fixed supply of approx 1000 coins.
    const isInsideCoinZone = Math.abs(chunkX) <= 20 && Math.abs(chunkZ) <= 20;
    const numCoinsToGenerate = (isInsideCoinZone && rng.random(0, 1) < 0.625) ? 1 : 0;

    for (let i = 0; i < numCoinsToGenerate; i++) {
        let coinX, coinZ;
        let attempts = 0;
        const MAX_ATTEMPTS = 50;
        let validSpotFound = false;

        // Try to find a spot that is NOT occupied by Trees or Rocks
        while (attempts < MAX_ATTEMPTS) {
            const localX = rng.random(0, CHUNK_SIZE);
            const localZ = rng.random(0, CHUNK_SIZE);
            const worldX = chunkWorldStartX + localX;
            const worldZ = chunkWorldStartZ + localZ;

            // Bounds check (Padding for enemy protection radius)
            // We use a safe padding (e.g. 5 units) so enemies have space to patrol
            const PADDING = 8; // ENEMY_PROTECTION_RADIUS
            if (worldX < worldMin + PADDING || worldX > worldMax - PADDING ||
                worldZ < worldMin + PADDING || worldZ > worldMax - PADDING) {
                attempts++;
                continue;
            }

            // CHECK OCCUPANCY GRID
            // Coins are small (0.4), but let's give them 0.5 clearance
            if (!grid.isOccupied(localX, localZ, 0.5)) {
                coinX = worldX;
                coinZ = worldZ;
                validSpotFound = true;

                // Mark grid for the coin
                grid.markOccupied(localX, localZ, 0.5);
                break;
            }
            attempts++;
        }

        if (validSpotFound && coinX !== undefined && coinZ !== undefined) {
            coinSpawns.push({ position: [coinX, 0, coinZ] }); // Y will be determined by Octree on main thread

            // --- ENEMY GENERATION (Linked to Coin) ---
            // Try to spawn 1 enemy for this coin
            let enemyAttempts = 0;
            const ENEMY_MAX_ATTEMPTS = 20;
            const PROTECTION_RADIUS = 8; // Max patrol radius

            while (enemyAttempts < ENEMY_MAX_ATTEMPTS) {
                const angle = rng.random(0, Math.PI * 2);
                const radius = rng.random(2, PROTECTION_RADIUS); // Between 2 and 8 meters from coin
                const eWorldX = coinX + Math.cos(angle) * radius;
                const eWorldZ = coinZ + Math.sin(angle) * radius;

                const eLocalX = eWorldX - chunkWorldStartX;
                const eLocalZ = eWorldZ - chunkWorldStartZ;

                // Check bounds and Grid
                // Enemies are about size 1.0, give them 1.0 clearance
                if (eLocalX >= 0 && eLocalX < CHUNK_SIZE && eLocalZ >= 0 && eLocalZ < CHUNK_SIZE) {
                    if (!grid.isOccupied(eLocalX, eLocalZ, 1.0)) {
                        enemySpawns.push({ position: [eWorldX, 0, eWorldZ], coinIndex: coinSpawns.length - 1 });
                        grid.markOccupied(eLocalX, eLocalZ, 1.0);
                        break;
                    }
                }
                enemyAttempts++;
            }
        }
    }

    return { coinSpawns, enemySpawns };
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

    // Initialize Occupancy Grid
    const grid = new OccupancyGrid(CHUNK_SIZE, 2); // 2 cells per unit = 0.5m resolution

    // Generate in priority order: Trees -> Rocks -> Flowers -> Grass
    const treesData = generateTreeData(chunkX, chunkZ, treesOptions, worldMin, worldMax, grid);
    const rocksData = generateRockData(chunkX, chunkZ, rocksOptions, worldMin, worldMax, grid);

    // Gameplay: Coins and Enemies (Prioritized over Flowers/Grass to ensure they spawn validly)
    // Note: We insert them into the grid so flowers/grass don't grow on coins/enemies
    const gameplayData = generateGameplayData(chunkX, chunkZ, worldMin, worldMax, grid);

    const flowersData = generateFlowerData(chunkX, chunkZ, flowersOptions, worldMin, worldMax, grid);
    const grassData = generateGrassData(chunkX, chunkZ, grassOptions, worldMin, worldMax, grid);

    const chunkData = {
        grassData,
        rocksData,
        treesData,
        flowersData,
        gameplayData,
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
