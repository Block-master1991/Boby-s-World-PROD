// Advanced LOD (Level of Detail) Manager
import type { BufferGeometry, Material, Object3D } from '@/lib/three-chunk';
import { Mesh, Vector3 } from '@/lib/three-chunk';
import { logger } from 'utils/logger';
import type { LODLevel, PerformanceStats } from './lod-utils';

interface LODObject {
    object: Object3D;
    levels: LODLevel[];
    currentLevel: number;
    lastDistance: number;
    morphing: boolean;
    morphProgress: number;
    morphSpeed: number;
}

export class LODManager {
    private lodObjects = new Map<string, LODObject>();
    private cameraPosition = new Vector3();
    private updateInterval = 100; // ms
    private lastUpdateTime = 0;
    private morphingObjects = new Set<string>();
    private globalQualityScale = 1.0;
    private targetFPS = 60;
    private currentFPS = 60;
    private fpsHistory: number[] = [];

    // Diagnostics
    private totalLODTime = 0;
    private lodEntries = 0;
    private lastDiagTime = 0;

    constructor() {
        this.initializePerformanceMonitoring();
    }

    registerLODObject(id: string, object: Object3D, levels: Omit<LODLevel, 'visible'>[]): void {
        const sortedLevels = [...levels].sort((a, b) => a.distance - b.distance);
        this.lodObjects.set(id, {
            object,
            levels: sortedLevels.map(level => ({ ...level, visible: false })),
            currentLevel: 0,
            lastDistance: 0,
            morphing: false,
            morphProgress: 0,
            morphSpeed: 2.0,
        });
    }

    unregisterLODObject(id: string): void {
        this.lodObjects.delete(id);
        this.morphingObjects.delete(id);
    }

    updateCameraPosition(position: Vector3): void {
        this.cameraPosition.copy(position);
    }

    update(deltaTime: number): void {
        const startTime = performance.now();
        const currentTime = performance.now();
        if (currentTime - this.lastUpdateTime >= this.updateInterval) {
            this.lastUpdateTime = currentTime;
            for (const [id, lodObject] of this.lodObjects) {
                if (!lodObject.object.visible) continue;
                this.updateLODObject(id, lodObject);
            }
        }
        this.updateMorphing(deltaTime);

        // Diagnostics
        this.totalLODTime += performance.now() - startTime;
        this.lodEntries++;
        if (currentTime - this.lastDiagTime > 5000) {
            const avg = this.totalLODTime / this.lodEntries;
            logger.log(`[PerfDiag] LODManager: ${avg.toFixed(3)}ms | Objects: ${this.lodObjects.size} | Morphing: ${this.morphingObjects.size}`);
            this.totalLODTime = 0;
            this.lodEntries = 0;
            this.lastDiagTime = currentTime;
        }
    }

    private updateLODObject(id: string, lodObject: LODObject): void {
        const distance = this.cameraPosition.distanceTo(lodObject.object.position);
        const scaledDistance = distance * this.globalQualityScale;

        let targetLevel = 0;
        for (let i = 0; i < lodObject.levels.length; i++) {
            const level = lodObject.levels[i];
            if (level && scaledDistance > level.distance) {
                targetLevel = i;
            }
        }

        if (targetLevel !== lodObject.currentLevel) {
            this.transitionToLODLevel(id, lodObject, targetLevel);
        }
        lodObject.lastDistance = distance;
    }

    private transitionToLODLevel(id: string, lodObject: LODObject, targetLevel: number): void {
        const currentData = lodObject.levels[lodObject.currentLevel];
        const targetData = lodObject.levels[targetLevel];

        if (currentData && targetData && currentData.geometry !== targetData.geometry) {
            this.startMorphing(id, lodObject, targetLevel);
        } else {
            this.applyLODLevel(lodObject, targetLevel);
        }
        lodObject.currentLevel = targetLevel;
    }

    private startMorphing(id: string, lodObject: LODObject, targetLevel: number): void {
        lodObject.morphing = true;
        lodObject.morphProgress = 0;
        this.morphingObjects.add(id);
        
        const targetData = lodObject.levels[targetLevel];
        if (targetData) this.ensureGeometryLoaded(targetData);
    }

    private updateMorphing(deltaTime: number): void {
        for (const id of this.morphingObjects) {
            const lodObject = this.lodObjects.get(id);
            if (!lodObject) continue;

            lodObject.morphProgress += deltaTime * lodObject.morphSpeed;

            if (lodObject.morphProgress >= 1.0) {
                lodObject.morphing = false;
                lodObject.morphProgress = 1.0;
                this.morphingObjects.delete(id);
                this.applyLODLevel(lodObject, lodObject.currentLevel);
            } else {
                this.updateMorphProgress(lodObject, lodObject.morphProgress);
            }
        }
    }

    private applyLODLevel(lodObject: LODObject, levelIndex: number): void {
        const level = lodObject.levels[levelIndex];
        if (!level) return;

        if (lodObject.object instanceof Mesh) {
            if (level.geometry) lodObject.object.geometry = level.geometry;
            if (level.material) lodObject.object.material = level.material;
        }

        lodObject.object.visible = level.quality > 0.01;
        lodObject.levels.forEach((lvl, index) => {
            lvl.visible = index === levelIndex;
        });
    }

    private updateMorphProgress(lodObject: LODObject, progress: number): void {
        if (!lodObject.levels[lodObject.currentLevel]) return;

        if (lodObject.object instanceof Mesh) {
            this.setObjectOpacity(lodObject.object, progress);
        } else {
            lodObject.object.traverse((child) => {
                if (child instanceof Mesh) this.setObjectOpacity(child, progress);
            });
        }
    }

    private setObjectOpacity(mesh: Mesh, opacity: number): void {
        if (!mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mat => {
            const m = mat as Material & { opacity?: number; transparent?: boolean };
            if (m && 'opacity' in m) {
                m.opacity = opacity;
                m.transparent = opacity < 0.99;
            }
        });
    }

    private ensureGeometryLoaded(level: LODLevel): void {
        const geom = level.geometry as BufferGeometry & { load?: () => Promise<void> };
        if (geom && typeof geom.load === 'function') {
            geom.load().catch(logger.warn);
        }
    }

    private initializePerformanceMonitoring(): void {
        let lastTime = performance.now();
        const monitorFPS = () => {
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            const fps = 1000 / deltaTime;

            this.fpsHistory.push(fps);
            if (this.fpsHistory.length > 10) this.fpsHistory.shift();
            this.currentFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            this.adjustQualityForPerformance();

            lastTime = currentTime;
            requestAnimationFrame(monitorFPS);
        };
        requestAnimationFrame(monitorFPS);
    }

    private adjustQualityForPerformance(): void {
        const fpsRatio = this.currentFPS / this.targetFPS;
        if (fpsRatio < 0.8) {
            this.globalQualityScale = Math.max(0.5, this.globalQualityScale * 0.95);
        } else if (fpsRatio > 0.95) {
            this.globalQualityScale = Math.min(1.0, this.globalQualityScale * 1.01);
        }
    }

    setQualityScale(scale: number): void {
        this.globalQualityScale = Math.max(0.1, Math.min(1.0, scale));
    }

    getQualityScale(): number {
        return this.globalQualityScale;
    }

    getPerformanceStats(): PerformanceStats {
        return {
            currentFPS: Math.round(this.currentFPS),
            targetFPS: this.targetFPS,
            qualityScale: this.globalQualityScale.toFixed(2),
            lodObjects: this.lodObjects.size,
            morphingObjects: this.morphingObjects.size,
        };
    }

    dispose(): void {
        this.lodObjects.clear();
        this.morphingObjects.clear();
        this.fpsHistory = [];
    }
}

let lodManager: LODManager | null = null;

export const initializeLODManager = (): LODManager => {
    if (!lodManager) lodManager = new LODManager();
    return lodManager;
};

export const getLODManager = (): LODManager | null => lodManager;

