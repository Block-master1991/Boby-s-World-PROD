import type * as THREE from 'three';
import { logger } from '../logger';

export class LODManager {
  private static instance: LODManager;
  private _camera: THREE.Camera | null = null;

  private constructor() { }

  public static getInstance(): LODManager {
    if (!LODManager.instance) {
      LODManager.instance = new LODManager();
    }
    return LODManager.instance;
  }

  public setCamera(camera: THREE.Camera): void {
    this._camera = camera;
  }

  public get camera(): THREE.Camera | null {
    return this._camera;
  }

  public updateLODDistances(qualityLevel: number): void {
    logger.log(`[LODManager] Updating LOD distances with quality level: ${qualityLevel}`);
    // Future implementation: Traverse scene and update LOD objects based on _camera position and qualityLevel
  }
}

export const lodManager = LODManager.getInstance();
