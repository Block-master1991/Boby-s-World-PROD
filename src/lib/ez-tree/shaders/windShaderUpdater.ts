export function updateWindShaders(materials: THREE.Material[], time: number): void {
  materials.forEach((mat) => {
    if (mat && mat.userData && mat.userData.shader && mat.userData.shader.uniforms) {
      const shader = mat.userData.shader;
      if (shader.uniforms.uTime) {
        shader.uniforms.uTime.value = time;
      }
    }
  });
}

import * as THREE from 'three';
import { GrassOptions } from '../environment/grass';
import { FlowerOptions } from '../environment/flowers';

export function updateWindShaderUniforms(material: THREE.Material, options: GrassOptions, time: number): void {
  if (!material) return;

  if (material.userData && material.userData.shader && material.userData.shader.uniforms) {
    const shader = material.userData.shader;
    if (shader.uniforms.uTime) {
      shader.uniforms.uTime.value = time;
    }

    if (shader.uniforms.uWindStrength) {
      shader.uniforms.uWindStrength.value = new THREE.Vector3(
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

export function updateFlowerWindShaderUniforms(material: THREE.Material, options: FlowerOptions, time: number): void {
  if (!material) return;

  if (material.userData && material.userData.shader && material.userData.shader.uniforms) {
    const shader = material.userData.shader;
    if (shader.uniforms.uTime) {
      shader.uniforms.uTime.value = time;
    }

    if (shader.uniforms.uWindStrength) {
      shader.uniforms.uWindStrength.value = new THREE.Vector3(
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
