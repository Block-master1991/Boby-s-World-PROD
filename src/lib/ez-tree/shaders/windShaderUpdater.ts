export function updateWindShaders(materials: THREE.Material[], time: number): void {
  materials.forEach(mat => {
    if (mat && mat.userData && mat.userData["shader"] && mat.userData["shader"].uniforms) {
      const shader = mat.userData["shader"] as { uniforms: { uTime: { value: number } } };
      if (shader.uniforms.uTime) {
        shader.uniforms.uTime.value = time;
      }
    }
  });
}

import type * as THREE from "three";
import type { FlowerOptions } from "../environment/flowers";
import type { GrassOptions } from "../environment/grass";

export function updateWindShaderUniforms(
  material: THREE.Material,
  options: GrassOptions,
  time: number
): void {
  if (!material) return;

  if (material.userData && material.userData["shader"] && material.userData["shader"].uniforms) {
    const shader = material.userData["shader"] as {
      uniforms: {
        uTime: { value: number };
        uWindStrength: { value: THREE.Vector3 };
        uWindFrequency: { value: number };
        uWindScale: { value: number };
      };
    };

    if (shader.uniforms.uTime) {
      shader.uniforms.uTime.value = time;
    }

    if (shader.uniforms.uWindStrength) {
      shader.uniforms.uWindStrength.value.set(
        options.windStrength.x,
        options.windStrength.y,
        options.windStrength.z
      );
    }

    if (shader.uniforms.uWindFrequency) {
      shader.uniforms.uWindFrequency.value = options.windFrequency;
    }

    if (shader.uniforms.uWindScale) {
      shader.uniforms.uWindScale.value = options.windScale || 70.0;
    }

    // Force material update
    material.needsUpdate = true;
  }
}

export function updateFlowerWindShaderUniforms(
  material: THREE.Material,
  options: FlowerOptions,
  time: number
): void {
  if (!material) return;

  if (material.userData && material.userData["shader"] && material.userData["shader"].uniforms) {
    const shader = material.userData["shader"] as {
      uniforms: {
        uTime: { value: number };
        uWindStrength: { value: THREE.Vector3 };
        uWindFrequency: { value: number };
        uWindScale: { value: number };
      };
    };

    if (shader.uniforms.uTime) {
      shader.uniforms.uTime.value = time;
    }

    if (shader.uniforms.uWindStrength) {
      shader.uniforms.uWindStrength.value.set(
        options.windStrength.x,
        options.windStrength.y,
        options.windStrength.z
      );
    }

    if (shader.uniforms.uWindFrequency) {
      shader.uniforms.uWindFrequency.value = options.windFrequency;
    }

    if (shader.uniforms.uWindScale) {
      shader.uniforms.uWindScale.value = options.windScale || 500.0;
    }

    // Force material update
    material.needsUpdate = true;
  }
}
