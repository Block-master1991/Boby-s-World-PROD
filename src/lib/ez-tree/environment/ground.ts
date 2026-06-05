import * as THREE from "three";
import { logger } from "utils/logger";
import { getModel, putModel } from "../../indexedDB"; // Import IndexedDB utilities
import { GrassOptions } from "./grass"; // Import GrassOptions for type reference

let loaded = false;
let _grassTexture: THREE.Texture | null = null;
let _dirtTexture: THREE.Texture | null = null;
let _dirtNormal: THREE.Texture | null = null;

export class Ground extends THREE.Mesh {
  public options: GrassOptions;

  /* eslint-disable no-await-in-loop */
  public static async fetchAssets(maxAttempts: number = 20): Promise<void> {
    if (loaded) return;
    const loader = new THREE.TextureLoader();
    const loadTex = async (path: string, name: string) => {
      for (let i = 1; i <= maxAttempts; i++) {
        try {
          const cached = await getModel(name);
          if (cached) {
            const blobUrl = URL.createObjectURL(new Blob([cached], { type: "image/jpeg" }));
            const tex = await loader.loadAsync(blobUrl);
            URL.revokeObjectURL(blobUrl);
            return tex;
          }
          logger.log(`[Ground] Fetching ${name} from network (attempt ${i}): ${path}`);
          const response = await fetch(path);
          if (!response.ok) throw new Error(`HTTP error ${response.status}`);
          const buffer = await response.arrayBuffer();
          await putModel(name, buffer);
          const blobUrl = URL.createObjectURL(new Blob([buffer], { type: "image/jpeg" }));
          const tex = await loader.loadAsync(blobUrl);
          URL.revokeObjectURL(blobUrl);
          return tex;
        } catch (e) {
          logger.warn(`[Ground] Attempt ${i} failed for ${name}:`, e);
          if (i === maxAttempts) {
            logger.error(`[Ground] Persistent failure for ${name}. Falling back to direct load.`);
            return loader.loadAsync(path);
          }
          const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      throw new Error(`Failed to load ground texture ${name}`);
    };

    _grassTexture = await loadTex("/textures/ground/grass.jpg", "grass_texture");
    _dirtTexture = await loadTex("/textures/ground/dirt_color.jpg", "dirt_color_texture");
    _dirtNormal = await loadTex("/textures/ground/dirt_normal.jpg", "dirt_normal_texture");

    [_grassTexture, _dirtTexture, _dirtNormal].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if (tex !== _dirtNormal) tex.colorSpace = THREE.SRGBColorSpace;
    });
    /* eslint-enable no-await-in-loop */
    loaded = true;
  }

  constructor(
    options: GrassOptions = new GrassOptions(),
    width: number = 10000,
    height: number = 10000
  ) {
    super();
    this.options = options;
    this.geometry = new THREE.PlaneGeometry(width, height);
    this.rotation.x = -Math.PI / 2;
    this.receiveShadow = true;
    this.initMaterial();
  }

  private initMaterial(): void {
    Ground.fetchAssets().then(() => {
      this.material = new THREE.MeshPhongMaterial({
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.01,
        normalMap: _dirtNormal,
        shininess: 0.1,
      });

      (this.material as THREE.MeshPhongMaterial).onBeforeCompile = shader => {
        this.setupShaderUniforms(shader);
        this.injectShaderVaryings(shader);
        this.injectShaderFunctions(shader);
        this.injectShaderLogic(shader);
        (this.material as THREE.MeshPhongMaterial).userData["shader"] = shader;
      };
    });
  }

  private setupShaderUniforms(shader: { uniforms: { [uniform: string]: THREE.IUniform } }): void {
    shader.uniforms["uNoiseScale"] = { value: this.options.scale };
    shader.uniforms["uPatchiness"] = { value: this.options.patchiness };
    shader.uniforms["uGrassTexture"] = { value: _grassTexture };
    shader.uniforms["uDirtTexture"] = { value: _dirtTexture };
  }

  private injectShaderVaryings(shader: { vertexShader: string; fragmentShader: string }): void {
    shader.vertexShader = `
      varying vec3 vWorldPosition;
      ${shader.vertexShader}`;

    shader.fragmentShader = `
      varying vec3 vWorldPosition;
      uniform float uNoiseScale;
      uniform float uPatchiness;
      uniform sampler2D uGrassTexture;
      uniform sampler2D uDirtTexture;
      ${shader.fragmentShader}`;
  }

  private injectShaderFunctions(shader: { vertexShader: string; fragmentShader: string }): void {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
        vec4 groundWorldPosition = modelMatrix * vec4( transformed, 1.0 );
        vWorldPosition = groundWorldPosition.xyz;
        `
    );

    const simplexFunctions = `
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
      float simplex2d(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m; m = m * m;
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
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `${simplexFunctions}\nvoid main() {`
    );
  }

  private injectShaderLogic(shader: { fragmentShader: string }): void {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      vec2 uv = vec2(vWorldPosition.x, vWorldPosition.z);
      vec3 grassColor = texture2D(uGrassTexture, uv / 10.0).rgb;
      vec3 dirtColor = texture2D(uDirtTexture, uv / 10.0).rgb;
      float n = 0.5 + 0.5 * simplex2d(uv / uNoiseScale);
      float s = smoothstep(uPatchiness - 0.05 , uPatchiness + 0.05, n);
      vec4 sampledDiffuseColor = vec4(mix(grassColor, dirtColor, s), 1.0);
      diffuseColor *= sampledDiffuseColor;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      vec2 normalUv = vec2(vWorldPosition.x, vWorldPosition.z);
      vec3 mapN = texture2D( normalMap, normalUv / 30.0 ).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale;
      normal = normalize( tbn * mapN );
      `
    );
  }
}
