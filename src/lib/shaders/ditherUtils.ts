import type * as THREE from "three";

/**
 * Screen-space dithering shader injection for Three.js materials.
 */
export const injectDitherLogic = (material: THREE.Material) => {
  material.onBeforeCompile = shader => {
    // Preserve value set before compile, or across recompiles
    const stored = (material.userData as Record<string, unknown>)["_ditherValue"];
    const initValue = typeof stored === "number" ? stored : 0.0;
    shader.uniforms["ditherIntensity"] = { value: initValue };
    shader.fragmentShader = `uniform float ditherIntensity;\n${shader.fragmentShader}`;

    const ditherLogic = `
      float dither(vec2 pos) {
          int x = int(mod(pos.x, 4.0)), y = int(mod(pos.y, 4.0));
          int i = x + y * 4;
          if (i == 0) return 0.0625; if (i == 1) return 0.5625; if (i == 2) return 0.1875; if (i == 3) return 0.6875;
          if (i == 4) return 0.8125; if (i == 5) return 0.3125; if (i == 6) return 0.9375; if (i == 7) return 0.4375;
          if (i == 8) return 0.25; if (i == 9) return 0.75; if (i == 10) return 0.125; if (i == 11) return 0.625;
          if (i == 12) return 1.0; if (i == 13) return 0.5; if (i == 14) return 0.875; return 0.375;
      }
    `;

    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${ditherLogic}\nvoid main() {`)
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>\nif (ditherIntensity < 0.99 && dither(gl_FragCoord.xy) > ditherIntensity) discard;`
      );

    material.userData["shader"] = shader;
  };

  (material as THREE.Material & { setDitherIntensity?: (v: number) => void }).setDitherIntensity = (
    value: number
  ) => {
    // Always persist the value so onBeforeCompile can restore it on (re)compile
    (material.userData as Record<string, unknown>)["_ditherValue"] = value;
    const s = (material.userData as { shader?: { uniforms: { [key: string]: THREE.IUniform } } })[
      "shader"
    ];
    if (s?.uniforms["ditherIntensity"]) s.uniforms["ditherIntensity"].value = value;
  };
};
