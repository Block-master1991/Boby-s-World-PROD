/**
 * Environment Options — THREE.js-free types shared between main thread and Web Worker.
 *
 * These classes are intentionally kept in a separate file so that the chunk Worker
 * can import them without pulling in THREE.js (which crashes in a Worker context).
 */

export class GrassOptions {
  public instanceCountPerChunk: number = 2000;
  public scale: number = 100;
  public patchiness: number = 0.8;
  public size: { x: number; y: number; z: number } = { x: 0.2, y: 0.2, z: 0.2 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0.05, y: 0.05, z: 0.05 };
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 };
  public windFrequency: number = 1.2;
  public windScale: number = 500.0;
}

export class RockOptions {
  public rockCountPerChunk: number = 5;
  public size: { x: number; y: number; z: number } = { x: 0.2, y: 0.2, z: 0.2 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0.3, y: 0.3, z: 0.3 };
  public scale: number = 100;
  public patchiness: number = 0.7;
}

export class TreesOptions {
  public treeCountPerChunk: number = 1;
  public scale: number = 100;
  public patchiness: number = 0.7;
  public windStrength: { x: number; y: number; z: number } = { x: 0.05, y: 0.02, z: 0.05 };
  public windFrequency: number = 0.2;
  public windScale: number = 800.0;
}

export class FlowerOptions {
  public flowersCountPerChunk: number = 5;
  public size: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 0.5 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  public scale: number = 100.0;
  public patchiness: number = 0.6;
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 };
  public windFrequency: number = 1.2;
  public windScale: number = 500.0;
}
