// GPU Instancing System for High-Performance Rendering
// Optimizes rendering of repetitive objects like trees, grass, and rocks

import {
    InstancedMesh,
    Matrix4,
    Vector3,
    Quaternion,
    Euler,
    Object3D,
    Box3,
    Sphere,
    Frustum,
    Matrix4 as ThreeMatrix4,
    Vector3 as ThreeVector3,
    Camera,
} from '@/lib/three-chunk';

interface InstanceData {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    color?: number;
    lodLevel: number;
}

interface InstancedObjectConfig {
    geometry: any; // Three.js geometry
    material: any; // Three.js material
    maxInstances: number;
    lodDistances?: number[];
    castShadow?: boolean;
    receiveShadow?: boolean;
}

class GPUInstancingManager {
    private instancedMeshes = new Map<string, InstancedMesh>();
    private instanceData = new Map<string, InstanceData[]>();
    private activeInstances = new Map<string, number>();
    private cameraFrustum = new Frustum();
    private tempMatrix = new Matrix4();
    private tempVector = new Vector3();
    private tempBox = new Box3();

    constructor(private camera: Camera) { }

    // Create instanced mesh for a specific object type
    createInstancedObject(
        id: string,
        config: InstancedObjectConfig
    ): InstancedMesh {
        const instancedMesh = new InstancedMesh(
            config.geometry,
            config.material,
            config.maxInstances
        );

        instancedMesh.castShadow = config.castShadow ?? true;
        instancedMesh.receiveShadow = config.receiveShadow ?? true;
        instancedMesh.frustumCulled = false; // We'll handle culling manually

        this.instancedMeshes.set(id, instancedMesh);
        this.instanceData.set(id, []);
        this.activeInstances.set(id, 0);

        return instancedMesh;
    }

    // Add instance to the pool
    addInstance(id: string, data: InstanceData): boolean {
        const instances = this.instanceData.get(id);
        const activeCount = this.activeInstances.get(id) || 0;
        const mesh = this.instancedMeshes.get(id);

        if (!instances || !mesh || activeCount >= mesh.count) {
            return false; // No space available
        }

        instances.push(data);
        this.activeInstances.set(id, activeCount + 1);

        this.updateInstanceMatrix(id, activeCount, data);
        return true;
    }

    // Update instance transformation matrix
    private updateInstanceMatrix(id: string, index: number, data: InstanceData): void {
        const mesh = this.instancedMeshes.get(id);
        if (!mesh) return;

        // Create transformation matrix
        this.tempMatrix.makeRotationFromEuler(data.rotation);
        this.tempMatrix.setPosition(data.position);
        this.tempMatrix.scale(data.scale);

        mesh.setMatrixAt(index, this.tempMatrix);

        // Update color if provided
        if (data.color !== undefined && mesh.material && 'setColorAt' in mesh.material) {
            (mesh.material as any).setColorAt(index, data.color);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.material && 'needsUpdate' in mesh.material) {
            (mesh.material as any).needsUpdate = true;
        }
    }

    // Remove instance from the pool
    removeInstance(id: string, index: number): void {
        const instances = this.instanceData.get(id);
        const activeCount = this.activeInstances.get(id) || 0;

        if (!instances || index >= activeCount) return;

        // Move last instance to this position (swap and pop)
        if (index < activeCount - 1) {
            instances[index] = instances[activeCount - 1];
            this.updateInstanceMatrix(id, index, instances[index]);
        }

        instances.pop();
        this.activeInstances.set(id, activeCount - 1);
    }

    // Update all instances for LOD and culling
    updateInstances(): void {
        this.updateCameraFrustum();

        for (const [id, mesh] of this.instancedMeshes) {
            this.updateLODCulling(id);
        }
    }

    // Update camera frustum for culling
    private updateCameraFrustum(): void {
        const camera = this.camera;
        const matrix = new ThreeMatrix4().multiplyMatrices(
            camera.projectionMatrix,
            camera.matrixWorldInverse
        );
        this.cameraFrustum.setFromProjectionMatrix(matrix);
    }

    // Update LOD levels and frustum culling
    private updateLODCulling(id: string): void {
        const mesh = this.instancedMeshes.get(id);
        const instances = this.instanceData.get(id);
        const cameraPosition = this.camera.position;

        if (!mesh || !instances) return;

        for (let i = 0; i < instances.length; i++) {
            const instance = instances[i];
            const distance = cameraPosition.distanceTo(instance.position);

            // Frustum culling
            this.tempBox.setFromCenterAndSize(instance.position, new ThreeVector3(1, 1, 1));
            const inFrustum = this.cameraFrustum.intersectsBox(this.tempBox);

            // LOD calculation
            let lodLevel = 0;
            const config = mesh.userData.config as InstancedObjectConfig;

            if (config.lodDistances) {
                for (let lod = 0; lod < config.lodDistances.length; lod++) {
                    if (distance > config.lodDistances[lod]) {
                        lodLevel = lod + 1;
                    }
                }
            }

            // Update instance visibility and LOD
            instance.lodLevel = lodLevel;
            mesh.setMatrixAt(i, inFrustum ? this.tempMatrix : new Matrix4().makeScale(0, 0, 0));
        }

        mesh.instanceMatrix.needsUpdate = true;
    }

    // Batch add multiple instances efficiently
    addInstancesBatch(id: string, instances: InstanceData[]): number {
        let addedCount = 0;
        for (const instance of instances) {
            if (this.addInstance(id, instance)) {
                addedCount++;
            } else {
                break; // No more space
            }
        }
        return addedCount;
    }

    // Get statistics for debugging/monitoring
    getStats() {
        const stats: { [key: string]: any } = {};

        for (const [id, mesh] of this.instancedMeshes) {
            const activeCount = this.activeInstances.get(id) || 0;
            stats[id] = {
                maxInstances: mesh.count,
                activeInstances: activeCount,
                utilization: (activeCount / mesh.count) * 100,
                drawCalls: 1, // Each instanced mesh is 1 draw call
            };
        }

        return stats;
    }

    // Clear all instances for a specific type
    clearInstances(id: string): void {
        const mesh = this.instancedMeshes.get(id);
        if (mesh) {
            this.instanceData.set(id, []);
            this.activeInstances.set(id, 0);
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    // Dispose resources
    dispose(): void {
        for (const mesh of this.instancedMeshes.values()) {
            mesh.dispose();
        }
        this.instancedMeshes.clear();
        this.instanceData.clear();
        this.activeInstances.clear();
    }
}

// Singleton instance
let gpuInstancingManager: GPUInstancingManager | null = null;

export const initializeGPUInstancing = (camera: Camera): GPUInstancingManager => {
    if (!gpuInstancingManager) {
        gpuInstancingManager = new GPUInstancingManager(camera);
    }
    return gpuInstancingManager;
};

export const getGPUInstancingManager = (): GPUInstancingManager | null => {
    return gpuInstancingManager;
};

// Utility functions for common instanced objects
export const createTreeInstances = (positions: Vector3[], scales: Vector3[], rotations: Euler[]): InstanceData[] => {
    return positions.map((pos, i) => ({
        position: pos,
        rotation: rotations[i] || new Euler(0, Math.random() * Math.PI * 2, 0),
        scale: scales[i] || new Vector3(1, 1, 1),
        lodLevel: 0,
    }));
};

export const createGrassInstances = (positions: Vector3[], density = 1): InstanceData[] => {
    const instances: InstanceData[] = [];
    const spread = 2; // Spread around each position

    for (const basePos of positions) {
        for (let i = 0; i < density; i++) {
            const offsetX = (Math.random() - 0.5) * spread;
            const offsetZ = (Math.random() - 0.5) * spread;
            const height = Math.random() * 0.3 + 0.7; // Vary height

            instances.push({
                position: new Vector3(basePos.x + offsetX, basePos.y, basePos.z + offsetZ),
                rotation: new Euler(0, Math.random() * Math.PI * 2, 0),
                scale: new Vector3(1, height, 1),
                lodLevel: 0,
            });
        }
    }

    return instances;
};
