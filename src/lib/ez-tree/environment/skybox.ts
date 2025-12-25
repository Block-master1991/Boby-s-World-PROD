import * as THREE from 'three';
import { getDevicePerformanceConfig } from '../../utils';

/**
 * Skybox implementation using HDR texture for realistic environment and lighting.
 */
export class Skybox extends THREE.Object3D {
  public sun: THREE.DirectionalLight;
  public sunPosition = new THREE.Vector3();
  private skyMesh: THREE.Mesh | null = null;
  public loadingPromise: Promise<void>;
  private resolveLoading!: () => void;
  private rejectLoading!: (reason?: any) => void;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(renderer?: THREE.WebGLRenderer) {
    super();
    this.renderer = renderer || null;
    this.name = 'Skybox';

    this.loadingPromise = new Promise((resolve, reject) => {
      this.resolveLoading = resolve;
      this.rejectLoading = reject;
    });

    // Create a directional light to act as the Sun's light source
    // HDR handles ambient, but a directional light is needed for sharp shadows
    const perfConfig = getDevicePerformanceConfig();
    this.sun = new THREE.DirectionalLight(0xffffff, 5);
    this.sun.castShadow = !perfConfig.isMobile;

    // Expand shadow area to cover full render distance dynamically
    const SHADOW_SIZE = 200; // Total 400x400 area - Ultra sharp shadows
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
    // Default HDR file specified by the user
    const hdrUrl = '/textures/hdr/citrus_orchard_road_puresky_8k.hdr';
    const perfConfig = getDevicePerformanceConfig();

    console.log(`[Skybox] Initializing Worker for HDR: ${hdrUrl}`);

    try {
      // Initialize the worker
      const worker = new Worker(new URL('../../../workers/hdrWorker.ts', import.meta.url));

      worker.onmessage = (e) => {
        const { status, width, height, data, error } = e.data;

        if (status === 'progress') {
          // Progress reported from worker: e.data.progress (0.0 to 1.0)
          return;
        }

        if (status === 'success') {
          // Create DataTexture from the worker's data
          // If isHalf is true, data is a Uint16Array representing HalfFloat
          const type = e.data.isHalf ? THREE.HalfFloatType : THREE.FloatType;

          const texture = new THREE.DataTexture(
            data,
            width,
            height,
            THREE.RGBAFormat,
            type
          );

          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false; // Disable mipmaps to prevent artifacts
          texture.anisotropy = 1; // Disable anisotropy completely to prevent artifacts
          texture.colorSpace = THREE.LinearSRGBColorSpace; // Proper HDR color space for accurate lighting
          texture.flipY = false;
          texture.needsUpdate = true;

          // Apply to sky sphere
          this.setupSkyMesh(texture, perfConfig);

          // Attempt to apply to the scene background and environment
          this.applyToScene(texture);

          console.log(`[Skybox] Worker successful! 8K HDR Applied. (${perfConfig.isMobile ? 'Mobile' : 'Desktop'})`);

          // CRITICAL MEMORY CLEANUP:
          // We can't null data immediately as Three.js might need it for a frame,
          // but we can ensure no local references remain in the worker scope.
          worker.terminate();

          // Mark as loaded
          if (this.resolveLoading) this.resolveLoading();
        } else {
          console.error('[Skybox] Worker Error:', error);
          this.applyFallbackSky();
          worker.terminate();
          // Still resolve to prevent hanging the loader, but log the error
          if (this.resolveLoading) this.resolveLoading();
        }
      };

      worker.onerror = (err) => {
        console.error('[Skybox] Worker Crash:', err);
        this.applyFallbackSky();
        worker.terminate();
        if (this.resolveLoading) this.resolveLoading();
      };

      worker.postMessage({ url: hdrUrl });

    } catch (workerInitError) {
      console.error('[Skybox] Failed to initialize HDR Worker:', workerInitError);
      this.applyFallbackSky();
      if (this.resolveLoading) this.resolveLoading();
    }
  }

  private setupSkyMesh(texture: THREE.Texture, perfConfig: any) {
    // Professional quality: higher resolution geometry for better sky quality
    const isHighEndGPU = perfConfig.renderer.shadowMapSize >= 2048;
    const segments = perfConfig.isMobile ? 64 : (isHighEndGPU ? 128 : 96);
    const rings = perfConfig.isMobile ? 32 : (isHighEndGPU ? 64 : 48);
    const geometry = new THREE.SphereGeometry(250, segments, rings);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false,
      fog: false
    });

    // Cleanup old mesh if it exists
    if (this.skyMesh) {
      this.remove(this.skyMesh);
      if (this.skyMesh.geometry) this.skyMesh.geometry.dispose();
      if (this.skyMesh.material instanceof THREE.Material) this.skyMesh.material.dispose();
    }

    this.skyMesh = new THREE.Mesh(geometry, material);
    this.skyMesh.name = 'SkySphereMesh';
    this.add(this.skyMesh);
  }

  /**
   * Fallback to a beautiful procedural-like sky if the heavy HDR fails.
   */
  private applyFallbackSky() {
    console.warn('[Skybox] Using fallback atmospheric sky');
    const geometry = new THREE.SphereGeometry(250, 64, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x87CEEB, // Sky blue
      side: THREE.BackSide,
      fog: false
    });
    this.skyMesh = new THREE.Mesh(geometry, material);
    this.add(this.skyMesh);
  }

  /**
   * Automatically find the scene and apply the HDR as background and environment using PMREMGenerator.
   */
  private applyToScene(texture: THREE.Texture) {
    const perfConfig = getDevicePerformanceConfig();

    const findAndApply = () => {
      let current: THREE.Object3D | null = this;
      while (current && !(current instanceof THREE.Scene)) {
        current = current.parent;
      }

      if (current instanceof THREE.Scene) {
        // Professional HDR environment mapping using PMREMGenerator
        if (this.renderer) {
          try {
            const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            pmremGenerator.compileEquirectangularShader();
            // Use PMREMGenerator with default high quality settings
            const envMap = pmremGenerator.fromEquirectangular(texture);
            pmremGenerator.dispose();

            // Apply the properly processed environment map
            current.background = null;
            current.environment = envMap.texture;

            console.log('[Skybox] PMREM environment map applied successfully');
          } catch (error) {
            console.warn('[Skybox] PMREMGenerator failed, falling back to direct texture:', error);
            // Fallback to direct texture if PMREM fails
            current.background = null;
            current.environment = texture;
          }
        } else {
          console.warn('[Skybox] No renderer available, using direct texture');
          // Fallback when no renderer is available
          current.background = null;
          current.environment = texture;
        }
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
      this.skyMesh.rotation.y = elapsedTime * 0.0025;
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
