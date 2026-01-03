import * as THREE from 'three';
import { GrassOptions } from '../environment/grass'; // Keep for reference if needed, but will use WindOptions

// Define a common interface for wind-related options
export interface WindOptions {
  windStrength: { x: number; y: number; z: number };
  windFrequency: number;
  windScale: number;
  patchiness?: number; // Optional, as not all objects might use it for wind
  scale?: number; // Optional, as not all objects might use it for wind
}

export function appendWindShader(
  material: THREE.Material | THREE.Material[],
  options: WindOptions,
  instanced: boolean = false,
  enableFade: boolean = false,
  fadeStart: number = 152.0,  // Optimized 3-unit range for best performance
  fadeEnd: number = 155.0
): void {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    if (!mat) return;

    // Check if the material already has the wind shader
    if (mat.userData && mat.userData.shader && mat.userData.shader.uniforms && mat.userData.shader.uniforms.uWindStrength) {
      // If it does, just update the values
      mat.userData.shader.uniforms.uWindStrength.value = new THREE.Vector3(
        options.windStrength.x,
        options.windStrength.y,
        options.windStrength.z
      );
      mat.userData.shader.uniforms.uWindFrequency.value = options.windFrequency;
      mat.userData.shader.uniforms.uWindScale.value = options.windScale || 70.0;
      return;
    }

    mat.onBeforeCompile = (shader: { uniforms: Record<string, { value: number | THREE.Vector3 | boolean }>; vertexShader: string; fragmentShader: string }) => {
      if (!shader) return;

      shader.uniforms = shader.uniforms || {};
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindStrength = {
        value: new THREE.Vector3(
          options.windStrength.x,
          options.windStrength.y,
          options.windStrength.z
        )
      };
      shader.uniforms.uWindFrequency = { value: 0.5 };
      shader.uniforms.uWindScale = { value: 70.0 };

      // Add fade uniforms if enabled
      if (enableFade) {
        shader.uniforms.uFadeStart = { value: fadeStart };
        shader.uniforms.uFadeEnd = { value: fadeEnd };
      }

      shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uWindStrength;
      uniform float uWindFrequency;
      uniform float uWindScale;
      ${enableFade ? 'varying float vDist;' : ''}
      ` + shader.vertexShader;

      // Add fade shader code if enabled
      if (enableFade) {
        shader.fragmentShader = `
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying float vDist;
        ${PROFESSIONAL_DITHER_GLSL}
        ` + shader.fragmentShader;
      }

      // Store a reference to the shader on the material for later updates
      mat.userData.shader = shader;
      mat.userData.lastWindUpdate = 0;

      shader.vertexShader = shader.vertexShader.replace(
        `void main() {`,
        `
        vec3 mod289(vec3 x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec2 mod289(vec2 x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec3 permute(vec3 x) {
          return mod289(((x * 34.0) + 1.0) * x);
        }

        float simplex2d(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;

          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        // GLSL Simplex Noise 3D
        // Source: https://github.com/ashima/webgl-noise

        vec3 mod289_3d(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289_4d(vec4 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute_4d(vec4 x) {
            return mod289_4d(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt(vec4 r) {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade(vec3 t) {
            return t*t*t*(t*(t*6.0-15.0)+10.0);
        }

        // Classic Simplex Noise 3D
        float simplex3d(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0);
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            // First corner
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx);

            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );

            //  x0 = x0 - 0. + 0.0 * C
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy; // 2.0 * C.x = 1/3 = C.y
            vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0 * C.x = -0.5

            // Permutations
            i = mod289_3d(i);
            vec4 p = permute_4d( permute_4d( permute_4d(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                      + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

            // Gradients: 7x7 points over a square, mapped onto an octahedron.
            // The ring size 17*17 = 289 is close to the mapping's singularity.
            float n_ = 0.142857142857; // 1.0/7.0
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

            vec3 g0 = vec3(a0.xy,h.x);
            vec3 g1 = vec3(a0.zw,h.y);
            vec3 g2 = vec3(a1.xy,h.z);
            vec3 g3 = vec3(a1.zw,h.w);

            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(g0,g0), dot(g1,g1), dot(g2,g2), dot(g3,g3)));
            g0 *= norm.x;
            g1 *= norm.y;
            g2 *= norm.z;
            g3 *= norm.w;

            // Mix contributions from the four corners
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(g0,x0), dot(g1,x1),
                                          dot(g2,x2), dot(g3,x3) ) );
        }

        void main() {`,
      );

      const vertexShaderCode = instanced ?
        `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec2 worldPositionXZ = (modelMatrix * mvPosition).xz;
        float windOffset = 2.0 * 3.14 * simplex2d(worldPositionXZ / uWindScale);

        // Improve grass movement in the instanced version
        float heightFactor = pow(position.y, 0.6);
        float bendReduction = 1.0 - abs(normal.y) * 0.2;

        // Use more fluid functions to ensure no stops in movement
        float smoothTime = uTime * 1.5; // Increase time speed more to make movement more fluid

        // Calculate basic waves used in tree.js
        float primaryWave = sin(uTime * uWindFrequency + windOffset);
        float secondaryWave = sin(2.0 * uTime * uWindFrequency + 1.3 * windOffset);
        float tertiaryWave = sin(5.0 * uTime * uWindFrequency + 1.5 * windOffset);

        // Combine waves with same weights used in tree.js
        float waveCombined = 0.5 * primaryWave + 0.3 * secondaryWave + 0.2 * tertiaryWave;

        // Apply height effect (like grass.js)
        float heightEffect = heightFactor;

        // Apply bending effect (like grass.js)
        float bendEffect = bendReduction;

        // Use same sine and cosine functions used in grass.js
        float sinComponent = sin(uTime * uWindFrequency + windOffset);
        float cosComponent = cos(uTime * 1.4 * uWindFrequency + windOffset);

        // Combine components to create realistic movement
        float realisticMovement = waveCombined * sinComponent * cosComponent * heightEffect * bendEffect;

        // Add some simple distortion to simulate disturbances
        float disturbance = sin(uTime * uWindFrequency * 3.0 + windOffset * 2.0) * 0.05;
        realisticMovement += disturbance;

        // Apply final movement with same strength used in tree.js
        vec3 windSway = uWindStrength * realisticMovement;

        // Add constraint to prevent excessive stretching
        float maxSway = length(uWindStrength) * 0.3; // Adjusted max sway
        float swayLength = length(windSway);
        if (swayLength > maxSway) {
          windSway = normalize(windSway) * maxSway;
        }

        // Apply wind effect only on relative coordinates of the grass blade, not on base position
        vec3 relativeOffset = vec3(0.0);

        // Use smooth transition function to avoid any stops in movement
        float smoothWind = sin(uTime * uWindFrequency + windOffset) * 0.5 + 0.5;
        smoothWind = smoothstep(0.0, 1.0, smoothWind);

        // Calculate deviation in X direction with smooth transition
        relativeOffset.x = windSway.x * position.y * heightFactor * smoothWind;

        // Calculate deviation in Z direction with smooth transition
        relativeOffset.z = windSway.z * position.y * heightFactor * smoothWind;

        // Add small constant vibrations for continuous movement
        float microMovement = sin(uTime * uWindFrequency * 8.0 + windOffset * 3.0) * 0.01;
        relativeOffset.x += microMovement * windSway.x;
        relativeOffset.z += microMovement * windSway.z;

        // Keep base position of grass blade and apply bending only
        vec3 modifiedPosition = transformed + relativeOffset;
        mvPosition = instanceMatrix * vec4(modifiedPosition, 1.0);
        mvPosition = modelViewMatrix * mvPosition;

        gl_Position = projectionMatrix * mvPosition;
        ` :
        `
        vec4 mvPosition = vec4(transformed, 1.0);

        // Calculate point position in world to determine wind effect
        vec3 worldPos = (modelMatrix * mvPosition).xyz;

        // Use simplex2d to unify wind effect with grass
        vec2 worldPos2D = worldPos.xz;
        float windOffset = simplex2d(worldPos2D / uWindScale) * 6.28318; // 2 * PI

        // Calculate basic wind effect - use same approach as in grass.js
        float windEffect = sin(uTime * uWindFrequency + windOffset) *
                         cos(uTime * 1.4 * uWindFrequency + windOffset);

        // Apply height effect - upper parts of flower are affected more by wind
        float heightFactor = position.y;

        // Apply movement as relative offset depending on point height
        // Use reduction factor 0.2 as in grass.js
        vec3 windSway = 0.2 * heightFactor * uWindStrength *
                       windEffect;

        // Apply the offset
        vec3 newPosition = transformed;
        newPosition.x += windSway.x;
        newPosition.z += windSway.z;

        // Apply matrices
        mvPosition = vec4(newPosition, 1.0);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `;

      shader.vertexShader = shader.vertexShader.replace(
        `#include <project_vertex>`,
        (enableFade ? `\n        // Calculate fade distance from ORIGINAL position (before wind)\n        vec4 fadeWorldPos = modelMatrix * vec4(transformed, 1.0);\n        vDist = length(fadeWorldPos.xyz - cameraPosition);\n        ` : '') + vertexShaderCode
      );

      // Add fade logic to fragment shader if enabled
      if (enableFade) {
        shader.fragmentShader = shader.fragmentShader.replace(
          `void main() {`,
          `void main() {\n          if (vDist < uFadeStart) {\n            // No fade\n          } else if (vDist >= uFadeEnd) {\n            discard;\n          } else {\n            float fade = smoothstep(uFadeStart, uFadeEnd, vDist);\n            if (professionalDither(gl_FragCoord.xy) < fade) discard;\n          }\n          `
        );
      }

      mat.userData = mat.userData || {};
      mat.userData.shader = shader;
    };
  });
}

/**
 * Professional dithering using Golden Ratio noise.
 * Eliminates banding and line artifacts for natural-looking transparency.
 * Used in high-end rendering engines like Arnold and RenderMan.
 */
const PROFESSIONAL_DITHER_GLSL = `
  // Golden Ratio noise - best distribution for dithering
  float goldenRatioNoise(vec2 uv) {
    // Golden ratio for optimal point distribution
    const float PHI = 1.61803398874989484820459;
    
    // Triple hash for better randomness
    vec2 p = fract(uv * vec2(PHI, PHI * 0.5));
    p += dot(p, p + 19.19);
    
    return fract((p.x + p.y) * p.x);
  }
  
  // Enhanced dithering with multiple samples to break up patterns
  float professionalDither(vec2 screenPos) {
    // Offset samples to eliminate line artifacts
    float noise1 = goldenRatioNoise(screenPos);
    float noise2 = goldenRatioNoise(screenPos + vec2(0.5, 0.5));
    
    // Blend for smoother distribution
    return mix(noise1, noise2, 0.5);
  }
`;

/**
 * Applies professional screen-space dithered fade effect to materials.
 * Uses Interleaved Gradient Noise (IGN) for AAA-quality transparency.
 * @param material - Material or array of materials to apply fade to
 * @param fadeStart - Distance where fade begins (default: 135 for smoother transition)
 * @param fadeEnd - Distance where fade completes (default: 155)
 */
export function applyProfessionalFade(
  material: THREE.Material | THREE.Material[],
  fadeStart: number = 152.0,  // Optimized 3-unit range for best performance
  fadeEnd: number = 155.0
): void {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    if (!mat) return;

    const originalOnBeforeCompile = mat.onBeforeCompile;

    mat.onBeforeCompile = (shader: { uniforms: Record<string, any>; vertexShader: string; fragmentShader: string }) => {
      // Call original onBeforeCompile if exists
      if (originalOnBeforeCompile) {
        originalOnBeforeCompile.call(mat, shader as any, undefined as any);
      }

      shader.uniforms = shader.uniforms || {};
      shader.uniforms.uFadeStart = { value: fadeStart };
      shader.uniforms.uFadeEnd = { value: fadeEnd };
      shader.uniforms.uTime = { value: 0.0 }; // Required by ChunkManager

      // Add vDist varying to vertex shader
      shader.vertexShader = `
      varying float vDist;
      ` + shader.vertexShader;

      // Add fragment shader header with professional dithering and uniforms
      shader.fragmentShader = `
      uniform float uFadeStart;
      uniform float uFadeEnd;
      uniform float uTime;
      varying float vDist;
      ${PROFESSIONAL_DITHER_GLSL}
      ` + shader.fragmentShader;

      // Calculate distance in vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        `#include <project_vertex>`,
        `#include <project_vertex>
        vec4 fadeWorldPos = modelMatrix * vec4(transformed, 1.0);
        vDist = length(fadeWorldPos.xyz - cameraPosition);
        `
      );

      // Apply optimized dithered fade in fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        `void main() {`,
        `void main() {
        // Early exit if far from fade zone (performance optimization)
        if (vDist < uFadeStart) {
          // No fade needed
        } else if (vDist >= uFadeEnd) {
          discard; // Fully faded, discard immediately
        } else {
          // In fade zone - apply dithering
          float fade = smoothstep(uFadeStart, uFadeEnd, vDist);
          float ditherPattern = professionalDither(gl_FragCoord.xy);
          if (ditherPattern < fade) discard;
        }
        `
      );

      mat.userData = mat.userData || {};
      mat.userData.shader = shader;
    };
  });
}
