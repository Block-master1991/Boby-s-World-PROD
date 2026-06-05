import type * as THREE from "three";

import { getLODManager } from "@/lib/lod-manager";

export class LODManager {
  private static instance: LODManager;
  private _camera: THREE.Camera | null = null;

  private constructor() {}

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
    // Professional implementation: Bridge to the active LOD system
    // This scales the LOD switching distances based on performance quality level
    const activeLODManager = getLODManager();
    if (activeLODManager) {
      activeLODManager.setQualityScale(qualityLevel);
    }
  }
}

export const lodManager = LODManager.getInstance();
