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
    this.sun.shadow.camera.left = -250;
    this.sun.shadow.camera.right = 250;
    this.sun.shadow.camera.top = 250;
    this.sun.shadow.camera.bottom = -250;
    this.sun.shadow.mapSize.set(perfConfig.renderer.shadowMapSize, perfConfig.renderer.shadowMapSize);
    this.sun.shadow.bias = -0.0001;
    this.add(this.sun);

    // Initial sun position (adjusted to match a common bright spot in HDRs or default)
    this.sunPosition.set(100, 200, 150).normalize();
    this.sun.position.copy(this.sunPosition).multiplyScalar(350);

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
   */
  public update(elapsedTime: number) {
    if (this.skyMesh) {
      // Very slow rotation to simulate cloud movement
      this.skyMesh.rotation.y = elapsedTime * 0.005;
    }
  }

  // Compatibility stubs for any external calls to procedural sky methods
  public updateSky() { /* Deprecated in favor of update() */ }
  get sunElevation() { return 20; }
  set sunElevation(v: number) { }
  get sunAzimuth() { return 180; }
  set sunAzimuth(v: number) { }
}
