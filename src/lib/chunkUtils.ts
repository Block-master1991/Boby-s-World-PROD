// src/lib/chunkUtils.ts

export const CHUNK_SIZE = 50; // Each chunk is 50x50 units
export const RENDER_DISTANCE_CHUNKS = 2; // Render current chunk + 2 chunks in each direction (total 5x5 chunks)

/**
 * Converts world coordinates to chunk coordinates.
 * @param worldX The world X coordinate.
 * @param worldZ The world Z coordinate.
 * @returns An object with chunkX and chunkZ.
 */
export function getChunkCoordinates(worldX: number, worldZ: number) {
  const chunkX = Math.floor(worldX / CHUNK_SIZE);
  const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
  return { chunkX, chunkZ };
}

/**
 * Converts chunk coordinates to the world position of the chunk's center.
 * @param chunkX The chunk X coordinate.
 * @param chunkZ The chunk Z coordinate.
 * @returns A THREE.Vector3 representing the center world position of the chunk.
 */
import * as THREE from 'three'; // Import THREE for Vector3
export function getChunkWorldPosition(chunkX: number, chunkZ: number) {
  const worldX = chunkX * CHUNK_SIZE + CHUNK_SIZE / 2;
  const worldZ = chunkZ * CHUNK_SIZE + CHUNK_SIZE / 2;
  return new THREE.Vector3(worldX, 0, worldZ);
}

/**
 * Generates a unique key for a chunk based on its coordinates.
 * @param chunkX The chunk X coordinate.
 * @param chunkZ The chunk Z coordinate.
 * @returns A string key for the chunk.
 */
export function getChunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}
