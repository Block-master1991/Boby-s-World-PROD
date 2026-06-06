import type { BufferGeometry, Material } from "@/lib/three-chunk";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { logger } from "utils/logger";

export interface LODLevel {
  distance: number;
  geometry?: BufferGeometry;
  material?: Material;
  quality: number; // 0-1, 1 is highest
  visible: boolean;
}

export interface PerformanceStats {
  currentFPS: number;
  targetFPS: number;
  qualityScale: string;
  lodObjects: number;
  morphingObjects: number;
}

export const createLODLevels = (
  baseGeometry: BufferGeometry,
  baseMaterial: Material,
  distances: number[] = [10, 25, 50, 100]
): LODLevel[] => {
  return distances.map((distance, index) => {
    const quality = 1 - index / distances.length;
    const geometry = index === 0 ? baseGeometry : createSimplifiedGeometry(baseGeometry, quality);

    return {
      distance,
      geometry,
      material: baseMaterial,
      quality,
      visible: false,
    };
  });
};

export const createSimplifiedGeometry = (
  originalGeometry: BufferGeometry,
  reductionFactor: number
): BufferGeometry => {
  if (reductionFactor >= 1.0) return originalGeometry.clone();

  try {
    const modifier = new SimplifyModifier();
    const posAttr = originalGeometry.getAttribute("position");
    if (!posAttr) return originalGeometry.clone();

    const count = Math.floor(posAttr.count * (1 - reductionFactor));
    if (count <= 0) return originalGeometry.clone();

    const simplified = modifier.modify(originalGeometry, count);
    const simplifiedPos = simplified.getAttribute("position");
    logger.log(
      `[LODManager] Simplified geometry: ${posAttr.count} -> ${simplifiedPos?.count ?? 0} vertices`
    );
    return simplified;
  } catch (err) {
    logger.warn("[LODManager] Geometry simplification failed, falling back to original", err);
    return originalGeometry.clone();
  }
};
