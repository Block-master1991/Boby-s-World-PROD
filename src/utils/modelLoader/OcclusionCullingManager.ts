import * as THREE from "three";
import { type OcclusionObject } from "./types";

export class OcclusionCullingManager {
  private static instance: OcclusionCullingManager;
  private objects: Map<string, OcclusionObject> = new Map();
  private camera: THREE.Camera | null = null;
  private occlusionMap: THREE.WebGLRenderTarget | null = null;
  private checkInterval = 100; // ms
  private lastCheck = 0;
  private renderer: THREE.WebGLRenderer | null = null;

  private constructor() {}

  public static getInstance(): OcclusionCullingManager {
    if (!OcclusionCullingManager.instance) {
      OcclusionCullingManager.instance = new OcclusionCullingManager();
    }
    return OcclusionCullingManager.instance;
  }

  public initialize(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.camera = camera;

    // Create occlusion map
    this.occlusionMap = new THREE.WebGLRenderTarget(256, 256, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
    });
  }

  public addObject(id: string, object: THREE.Object3D): void {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const boundingSphere = new THREE.Sphere();
    boundingBox.getBoundingSphere(boundingSphere);

    this.objects.set(id, {
      object,
      boundingBox,
      boundingSphere,
      visible: true,
      lastCheck: 0,
    });
  }

  public removeObject(id: string): void {
    this.objects.delete(id);
  }

  public update(): void {
    if (!this.camera || !this.renderer || !this.occlusionMap) return;

    const now = Date.now();
    if (now - this.lastCheck < this.checkInterval) return;

    this.lastCheck = now;

    // Render occlusion map logic
    this.renderer.setRenderTarget(this.occlusionMap);
    this.renderer.clear();

    // For now, we use simple visibility checks
    this.objects.forEach(occlusionObject => {
      const isVisible = this.checkVisibility(occlusionObject);
      if (isVisible !== occlusionObject.visible) {
        occlusionObject.visible = isVisible;
        occlusionObject.object.visible = isVisible;
      }
      occlusionObject.lastCheck = now;
    });

    this.renderer.setRenderTarget(null);
  }

  private checkVisibility(occlusionObject: OcclusionObject): boolean {
    if (!this.camera) return false;

    // Frustum culling
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      )
    );

    if (!frustum.intersectsSphere(occlusionObject.boundingSphere)) {
      return false;
    }

    // Distance culling
    const distance = this.camera.position.distanceTo(occlusionObject.boundingSphere.center);
    if (distance > occlusionObject.boundingSphere.radius * 20) {
      // Increased distance threshold
      return false;
    }

    return true;
  }

  public setCheckInterval(interval: number): void {
    this.checkInterval = Math.max(16, interval);
  }

  public getVisibleObjects(): THREE.Object3D[] {
    const visible: THREE.Object3D[] = [];
    this.objects.forEach(occlusionObject => {
      if (occlusionObject.visible) {
        visible.push(occlusionObject.object);
      }
    });
    return visible;
  }

  public getOcclusionStats() {
    let visible = 0;
    this.objects.forEach(occlusionObject => {
      if (occlusionObject.visible) visible++;
    });

    return {
      total: this.objects.size,
      visible,
      culled: this.objects.size - visible,
    };
  }
}

export const occlusionCullingManager = OcclusionCullingManager.getInstance();
