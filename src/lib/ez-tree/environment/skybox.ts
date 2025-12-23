import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { getDevicePerformanceConfig } from '../../utils';

/**
 * Skybox implementation using HDR texture for realistic environment and lighting.
 */
export class Skybox extends THREE.Object3D {
  public sun: THREE.DirectionalLight;
  public sunPosition = new THREE.Vector3();
  private skyMesh: THREE.Mesh | null = null;

  constructor() {
    super();
    this.name = 'Skybox';

    // Create a directional light to act as the Sun's light source
    // HDR handles ambient, but a directional light is needed for sharp shadows
    const perfConfig = getDevicePerformanceConfig();
    this.sun = new THREE.DirectionalLight(0xffffff, 5);
    this.sun.castShadow = !perfConfig.isMobile;

    // Expand shadow area massively to cover EVERYTHING dynamically
    const SHADOW_SIZE = 1000; // Total 2000x2000 area - covers mountains and far objects
    this.sun.shadow.camera.left = -SHADOW_SIZE;
    this.sun.shadow.camera.right = SHADOW_SIZE;
    this.sun.shadow.camera.top = SHADOW_SIZE;
    this.sun.shadow.camera.bottom = -SHADOW_SIZE;

    // Massive far plane to prevent clipping at any distance
    this.sun.shadow.camera.far = 5000;

    this.sun.shadow.mapSize.set(perfConfig.renderer.shadowMapSize, perfConfig.renderer.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05; // Critical for quality with large shadow maps
    this.add(this.sun);
    this.add(this.sun.target); // Add sun target to the scene for proper shadow following

    // Initial sun position (pushed further back for consistency)
    this.sunPosition.set(100, 200, 150).normalize();
    this.sun.position.copy(this.sunPosition).multiplyScalar(1000); // Increased distance to match scale

    // Ambient light to ensure objects aren't pitch black if HDR environment isn't applied yet
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.add(ambient);

    this.loadHDR();
  }

  private loadHDR() {
    const loader = new RGBELoader();
    // Default HDR file specified by the user
    const hdrUrl = '/textures/qwantani_moon_noon_puresky_8k.hdr';

    loader.load(hdrUrl, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;

      // Improve quality/clarity of the 1k texture
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 16;

      // Create a large sphere for the sky
      const geometry = new THREE.SphereGeometry(4500, 60, 40);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        transparent: false,
        fog: false // Important: prevent sky from fading into the fog
      });

      this.skyMesh = new THREE.Mesh(geometry, material);
      this.skyMesh.name = 'SkySphereMesh';
      this.add(this.skyMesh);

      // Attempt to apply to the scene background and environment
      this.applyToScene(texture);

      console.log(`[Skybox] Loaded HDR: ${hdrUrl}`);
    }, undefined, (error) => {
      console.error('[Skybox] Error loading HDR texture:', error);
    });
  }

  /**
   * Automatically find the scene and apply the HDR as background and environment.
   */
  private applyToScene(texture: THREE.Texture) {
    const findAndApply = () => {
      let current: THREE.Object3D | null = this;
      while (current && !(current instanceof THREE.Scene)) {
        current = current.parent;
      }

      if (current instanceof THREE.Scene) {
        current.background = texture;
        current.environment = texture;
      } else {
        // Retry shortly if not yet added to scene
        setTimeout(findAndApply, 100);
      }
    };
    findAndApply();
  }

  /**
   * Update method to handle slow rotation for moving sky effect.
   * Also updates sun position to follow camera for proper shadow rendering.
   */
  public update(elapsedTime: number, cameraPosition?: THREE.Vector3) {
    if (this.skyMesh) {
      // Very slow rotation to simulate cloud movement
      this.skyMesh.rotation.y = elapsedTime * 0.005;
    }

    // Update sun position to follow camera for proper shadow rendering
    // NOTE: Skybox parent is already moved to cameraPosition in Environment.ts
    // So we just set local position relative to 0,0,0
    this.sun.position.copy(this.sunPosition).multiplyScalar(1000);

    // Target is always the center of the skybox (where the player is)
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
  }

  // Compatibility stubs for any external calls to procedural sky methods
  public updateSky() { /* Deprecated in favor of update() */ }
  get sunElevation() { return 20; }
  set sunElevation(v: number) { }
  get sunAzimuth() { return 180; }
  set sunAzimuth(v: number) { }
}
