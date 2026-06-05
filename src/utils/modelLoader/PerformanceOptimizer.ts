import type * as THREE from "three";
import { compressionManager } from "./CompressionManager";
import { lodManager } from "./LODManager";
import { memoryManager } from "./MemoryManager";
import { occlusionCullingManager } from "./OcclusionCullingManager";
import { type PerformanceMetrics } from "./types";

export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer;
  private metrics: PerformanceMetrics = {
    fps: 60,
    memory: 0,
    drawCalls: 0,
    triangles: 0,
  };
  private targetFPS = 60;
  private targetMemory = 500 * 1024 * 1024; // 500MB
  private qualityLevel = 1;
  private lastOptimization = 0;
  private optimizationInterval = 5000; // 5 seconds
  private renderer: THREE.WebGLRenderer | null = null;

  private constructor() {}

  public static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer();
    }
    return PerformanceOptimizer.instance;
  }

  public initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.startMonitoring();
  }

  private startMonitoring(): void {
    if (typeof window === "undefined") return;

    let lastTime = performance.now();
    let frames = 0;

    const monitor = () => {
      const now = performance.now();
      frames++;

      if (now - lastTime >= 1000) {
        this.metrics.fps = Math.round((frames * 1000) / (now - lastTime));
        frames = 0;
        lastTime = now;

        this.updateMetrics();
        this.optimize();
      }

      requestAnimationFrame(monitor);
    };

    monitor();
  }

  private updateMetrics(): void {
    if (!this.renderer) return;

    const { info } = this.renderer;
    this.metrics.drawCalls = info.render.calls;
    this.metrics.triangles = info.render.triangles;

    const performanceWithMemory = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    if (performanceWithMemory.memory) {
      this.metrics.memory = performanceWithMemory.memory.usedJSHeapSize;
    }
  }

  private optimize(): void {
    const now = Date.now();
    if (now - this.lastOptimization < this.optimizationInterval) return;

    this.lastOptimization = now;

    // Adjust quality based on performance
    if (this.metrics.fps < this.targetFPS * 0.8) {
      this.decreaseQuality();
    } else if (this.metrics.fps > this.targetFPS * 0.9 && this.qualityLevel < 1) {
      this.increaseQuality();
    }

    // Memory optimization
    if (this.metrics.memory > this.targetMemory * 0.8) {
      this.optimizeMemory();
    }
  }

  private decreaseQuality(): void {
    this.qualityLevel = Math.max(0.1, this.qualityLevel - 0.1);
    this.applyQualitySettings();
  }

  private increaseQuality(): void {
    this.qualityLevel = Math.min(1, this.qualityLevel + 0.1);
    this.applyQualitySettings();
  }

  private applyQualitySettings(): void {
    compressionManager.setCompressionLevel("*", this.qualityLevel);
    lodManager.updateLODDistances(this.qualityLevel);
    occlusionCullingManager.setCheckInterval(Math.round(100 / this.qualityLevel));
  }

  private optimizeMemory(): void {
    memoryManager.cleanup();
    const gcWindow = window as Window & { gc?: () => void };
    if (gcWindow.gc) {
      gcWindow.gc();
    }
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getQualityLevel(): number {
    return this.qualityLevel;
  }

  public setTargetFPS(fps: number): void {
    this.targetFPS = Math.max(30, Math.min(120, fps));
  }

  public update(): void {
    // Placeholder for additional per-frame logic
  }
}

export const performanceOptimizer = PerformanceOptimizer.getInstance();
