import * as THREE from 'three';
import { PROFESSIONAL_DITHER_GLSL, SIMPLEX_NOISE_GLSL } from './shaderConstants';

/**
 * Common interface for wind-related options
 */
export interface WindOptions {
  windStrength: { x: number; y: number; z: number };
  windFrequency: number;
  windScale: number;
  patchiness?: number;
  scale?: number;
}

interface WindShaderUniforms {
  uTime: { value: number };
  uWindStrength: { value: THREE.Vector3 };
  uWindFrequency: { value: number };
  uWindScale: { value: number };
  uFadeStart?: { value: number };
  uFadeEnd?: { value: number };
  [key: string]: unknown;
}

interface ShaderObject {
  uniforms: WindShaderUniforms;
  vertexShader: string;
  fragmentShader: string;
}

/**
 * Professional screen-space dithered fade effect.
 */
export function applyProfessionalFade(
  material: THREE.Material | THREE.Material[],
  fadeStart: number = 122.0,
  fadeEnd: number = 125.0
): void {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    if (!mat) return;
    const originalOnBeforeCompile = mat.onBeforeCompile;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mat.onBeforeCompile = (shader: any) => {
      const typedShader = shader as ShaderObject;
      if (originalOnBeforeCompile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        originalOnBeforeCompile.call(mat, shader as any, undefined as any);
      }

      typedShader.uniforms.uFadeStart = { value: fadeStart };
      typedShader.uniforms.uFadeEnd = { value: fadeEnd };
      typedShader.uniforms.uTime = typedShader.uniforms.uTime || { value: 0.0 };

      typedShader.vertexShader = `varying float vDist;\n${typedShader.vertexShader}`;
      typedShader.fragmentShader = `uniform float uFadeStart;\nuniform float uFadeEnd;\nuniform float uTime;\nvarying float vDist;\n${PROFESSIONAL_DITHER_GLSL}\n${typedShader.fragmentShader}`;

      typedShader.vertexShader = typedShader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvec4 fadeWorldPos = modelMatrix * vec4(transformed, 1.0);\nvDist = length(fadeWorldPos.xyz - cameraPosition);`
      );

      typedShader.fragmentShader = typedShader.fragmentShader.replace(
        'void main() {',
        `void main() {\nif (vDist < uFadeStart) {} else if (vDist >= uFadeEnd) { discard; } else {\nfloat fade = smoothstep(uFadeStart, uFadeEnd, vDist);\nif (professionalDither(gl_FragCoord.xy) < fade) discard;\n}`
      );

      mat.userData['shader'] = typedShader;
    };
  });
}

function updateUniforms(shader: ShaderObject, options: WindOptions): void {
  shader.uniforms.uWindStrength.value.set(
    options.windStrength.x,
    options.windStrength.y,
    options.windStrength.z
  );
  shader.uniforms.uWindFrequency.value = options.windFrequency;
  shader.uniforms.uWindScale.value = options.windScale || 70.0;
}

function getWindVertexCode(instanced: boolean): string {
  if (instanced) {
    return `
      vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
      vec2 worldPositionXZ = (modelMatrix * mvPosition).xz;
      float windOffset = 2.0 * 3.14 * simplex2d(worldPositionXZ / uWindScale);
      float heightFactor = pow(position.y, 0.6);
      float bendReduction = 1.0 - abs(normal.y) * 0.2;
      float waveCombined = 0.5 * sin(uTime * uWindFrequency + windOffset) + 0.3 * sin(2.0 * uTime * uWindFrequency + 1.3 * windOffset) + 0.2 * sin(5.0 * uTime * uWindFrequency + 1.5 * windOffset);
      vec3 windSway = uWindStrength * (waveCombined * sin(uTime * uWindFrequency + windOffset) * cos(uTime * 1.4 * uWindFrequency + windOffset) * heightFactor * bendReduction + sin(uTime * uWindFrequency * 3.0 + windOffset * 2.0) * 0.05);
      float maxSway = length(uWindStrength) * 0.3;
      if (length(windSway) > maxSway) windSway = normalize(windSway) * maxSway;
      float smoothWind = smoothstep(0.0, 1.0, sin(uTime * uWindFrequency + windOffset) * 0.5 + 0.5);
      vec3 relativeOffset = vec3(windSway.x * position.y * heightFactor * smoothWind, 0.0, windSway.z * position.y * heightFactor * smoothWind);
      relativeOffset.xz += (sin(uTime * uWindFrequency * 8.0 + windOffset * 3.0) * 0.01) * windSway.xz;
      mvPosition = instanceMatrix * vec4(transformed + relativeOffset, 1.0);
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
    `;
  }
  return `
    vec4 mvPosition = vec4(transformed, 1.0);
    vec2 worldPos2D = (modelMatrix * mvPosition).xz;
    float windOffset = simplex2d(worldPos2D / uWindScale) * 6.28318;
    float windEffect = sin(uTime * uWindFrequency + windOffset) * cos(uTime * 1.4 * uWindFrequency + windOffset);
    vec3 windSway = 0.2 * position.y * uWindStrength * windEffect;
    mvPosition = modelViewMatrix * vec4(transformed + vec3(windSway.x, 0.0, windSway.z), 1.0);
    gl_Position = projectionMatrix * mvPosition;
  `;
}

interface WindShaderOptions extends WindOptions {
  instanced?: boolean;
  enableFade?: boolean;
  fadeStart?: number;
  fadeEnd?: number;
}

export function appendWindShader(
  material: THREE.Material | THREE.Material[],
  config: WindShaderOptions
): void {
  const {
    instanced = false,
    enableFade = false,
    fadeStart = 122.0,
    fadeEnd = 125.0
  } = config;

  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((mat) => {
    if (!mat) return;
    if (mat.userData['shader']?.uniforms?.uWindStrength) {
      updateUniforms(mat.userData['shader'], config);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mat.onBeforeCompile = (shader: any) => {
      const typedShader = shader as ShaderObject;
      typedShader.uniforms.uTime = { value: 0 };
      typedShader.uniforms.uWindStrength = { value: new THREE.Vector3(config.windStrength.x, config.windStrength.y, config.windStrength.z) };
      typedShader.uniforms.uWindFrequency = { value: config.windFrequency || 0.5 };
      typedShader.uniforms.uWindScale = { value: config.windScale || 70.0 };
      if (enableFade) {
        typedShader.uniforms.uFadeStart = { value: fadeStart };
        typedShader.uniforms.uFadeEnd = { value: fadeEnd };
      }

      typedShader.vertexShader = `uniform float uTime;\nuniform vec3 uWindStrength;\nuniform float uWindFrequency;\nuniform float uWindScale;\n${enableFade ? 'varying float vDist;' : ''}\n${typedShader.vertexShader}`;
      if (enableFade) typedShader.fragmentShader = `uniform float uFadeStart;\nuniform float uFadeEnd;\nvarying float vDist;\n${PROFESSIONAL_DITHER_GLSL}\n${typedShader.fragmentShader}`;

      typedShader.vertexShader = typedShader.vertexShader.replace('void main() {', `${SIMPLEX_NOISE_GLSL}\nvoid main() {`);
      typedShader.vertexShader = typedShader.vertexShader.replace('#include <project_vertex>', (enableFade ? 'vec4 fadeWorldPos = modelMatrix * vec4(transformed, 1.0);\nvDist = length(fadeWorldPos.xyz - cameraPosition);' : '') + getWindVertexCode(instanced));
      if (enableFade) {
        typedShader.fragmentShader = typedShader.fragmentShader.replace('void main() {', `void main() {\nif (vDist < uFadeStart) {} else if (vDist >= uFadeEnd) { discard; } else {\nfloat fade = smoothstep(uFadeStart, uFadeEnd, vDist);\nif (professionalDither(gl_FragCoord.xy) < fade) discard;\n}`);
      }
      mat.userData['shader'] = typedShader;
    };
  });
}
