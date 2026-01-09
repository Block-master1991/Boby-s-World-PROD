import * as THREE from 'three';
import { getDevicePerformanceConfig } from '../../utils';
import { getModel, putModel } from '../../indexedDB'; // Import IndexedDB utilities
import { logger } from 'utils/logger';

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
    this.sun.shadow.camera.far = 2500;

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

  private async loadHDR() {
    // Default HDR file specified by the user
    const hdrUrl = '/textures/hdr/citrus_orchard_road_puresky_8k.hdr';
    const modelName = 'hdr_data';
    const perfConfig = getDevicePerformanceConfig();

    logger.log(`[Skybox] Initializing Worker for HDR: ${hdrUrl}`);

    try {
      // Try to load HDR data from IndexedDB first
      let hdrData = await getModel(modelName);
      let blobUrl: string;

      if (hdrData) {
        logger.log(`[Skybox] Loading HDR from IndexedDB: ${modelName}`);
        // Create blob URL from cached data
        const blob = new Blob([hdrData], { type: 'application/octet-stream' });
        blobUrl = URL.createObjectURL(blob);
      } else {
        logger.log(`[Skybox] Fetching HDR from network: ${hdrUrl}`);
        // Fetch HDR data and cache it
        const response = await fetch(hdrUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        hdrData = await response.arrayBuffer();
        await putModel(modelName, hdrData);

        // Create blob URL from the data
        const blob = new Blob([hdrData], { type: 'application/octet-stream' });
        blobUrl = URL.createObjectURL(blob);
      }

      // Initialize the worker
      const worker = new Worker(new URL('../../../workers/hdrWorker.ts', import.meta.url));

      worker.onmessage = (e) => {
        const { status, width, height, data, error } = e.data;

        if (status === 'progress') {
          // Progress reported from worker: e.data.progress (0.0 to 1.0)
          logger.log(`[Skybox] HDR Processing Progress: ${(e.data.progress * 100).toFixed(1)}%`);
          return;
        }

        if (status === 'success') {
          // Clear timeout on success
          clearTimeout(workerTimeout);

          logger.log(`[Skybox] Worker returned data: width=${width}, height=${height}, dataLength=${data.length}, dataType=${data.constructor.name}`);

          // Check WebGL texture size limits before creating texture
          const maxTextureSize = this.renderer?.capabilities.maxTextureSize || 4096;
          logger.log(`[Skybox] WebGL Max Texture Size: ${maxTextureSize}, HDR Size: ${width}x${height}`);

          // If HDR exceeds WebGL limits, we need to handle it
          let finalWidth = width;
          let finalHeight = height;
          let finalData = data;

          if (width > maxTextureSize || height > maxTextureSize) {
            logger.warn(`[Skybox] HDR size (${width}x${height}) exceeds WebGL limit (${maxTextureSize}). Downscaling for compatibility.`);

            // Calculate downscaled dimensions that fit within WebGL limits
            const scaleFactor = Math.min(maxTextureSize / width, maxTextureSize / height);
            finalWidth = Math.floor(width * scaleFactor);
            finalHeight = Math.floor(height * scaleFactor);

            // Simple bilinear downscaling for HDR data
            finalData = downscaleHDRData(data, width, height, finalWidth, finalHeight);

            logger.log(`[Skybox] Downscaled HDR from ${width}x${height} to ${finalWidth}x${finalHeight}`);
          }

          // Create DataTexture from the worker's data
          // If isHalf is true, data is a Uint16Array representing HalfFloat
          const type = e.data.isHalf ? THREE.HalfFloatType : THREE.FloatType;

          const texture = new THREE.DataTexture(
            finalData,
            finalWidth,
            finalHeight,
            THREE.RGBAFormat,
            type
          );

          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false; // Disable mipmaps to prevent artifacts

          // High-quality anisotropy based on device capability for 8K HDR
          const perfConfig = getDevicePerformanceConfig();
          const maxAnisotropy = this.renderer?.capabilities.getMaxAnisotropy() || 16;
          texture.anisotropy = perfConfig.isMobile ?
            Math.min(maxAnisotropy, perfConfig.performanceLevel === 'high' ? 8 : 4) :
            Math.min(maxAnisotropy, 32); // Maximum quality for desktop

          // Remove colorSpace for HDR textures to preserve linear color values
          // texture.colorSpace = THREE.LinearSRGBColorSpace; // Commented out to preserve HDR colors
          texture.flipY = true;
          texture.needsUpdate = true;

          logger.log(`[Skybox] Texture created: ${finalWidth}x${finalHeight}, anisotropy=${texture.anisotropy}, colorSpace=${texture.colorSpace}`);

          // Apply to sky sphere
          this.setupSkyMesh(texture, perfConfig);

          // Attempt to apply to the scene background and environment
          this.applyToScene(texture);

          logger.log(`[Skybox] Worker successful! 8K HDR Applied. (${perfConfig.isMobile ? 'Mobile' : 'Desktop'})`);

          // CRITICAL MEMORY CLEANUP:
          // We can't null data immediately as Three.js might need it for a frame,
          // but we can ensure no local references remain in the worker scope.
          worker.terminate();

          // Revoke the blob URL to free memory
          URL.revokeObjectURL(blobUrl);

          // Mark as loaded
          if (this.resolveLoading) this.resolveLoading();
        } else {
          logger.error('[Skybox] Worker Error:', error);
          this.applyFallbackSky();
          worker.terminate();
          URL.revokeObjectURL(blobUrl);
          // Still resolve to prevent hanging the loader, but log the error
          if (this.resolveLoading) this.resolveLoading();
        }
      };

      worker.onerror = (err) => {
        logger.error('[Skybox] Worker Crash:', err);
        this.applyFallbackSky();
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        if (this.resolveLoading) this.resolveLoading();
      };

      // Add timeout for worker processing (60 seconds total)
      const workerTimeout = setTimeout(() => {
        logger.error('[Skybox] HDR Worker timeout - terminating');
        worker.terminate();
        URL.revokeObjectURL(blobUrl);
        this.applyFallbackSky();
        if (this.resolveLoading) this.resolveLoading();
      }, 60000);

      worker.postMessage({ url: blobUrl });

    } catch (workerInitError) {
      logger.error('[Skybox] Failed to initialize HDR Worker:', workerInitError);
      this.applyFallbackSky();
      if (this.resolveLoading) this.resolveLoading();
    }
  }

  private setupSkyMesh(texture: THREE.Texture, perfConfig: any) {
    // Professional quality: higher resolution geometry for better sky quality
    const isHighEndGPU = perfConfig.renderer.shadowMapSize >= 2048;
    const segments = perfConfig.isMobile ? 96 : (isHighEndGPU ? 192 : 128);
    const rings = perfConfig.isMobile ? 48 : (isHighEndGPU ? 96 : 64);
    const geometry = new THREE.SphereGeometry(200, segments, rings);

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

    logger.log(`[Skybox] Mesh created and added: geometry segments=${segments}, material has texture=${!!material.map}`);
    logger.log(`[Skybox] Mesh details: position=${this.skyMesh.position.toArray()}, visible=${this.skyMesh.visible}, renderOrder=${this.skyMesh.renderOrder}`);
    logger.log(`[Skybox] Material details: transparent=${material.transparent}, depthWrite=${material.depthWrite}, fog=${material.fog}, side=${material.side}`);

    // Force high render order to ensure sky renders last
    this.skyMesh.renderOrder = 1000;
    logger.log(`[Skybox] Set renderOrder to 1000 for sky mesh`);
  }

  /**
   * Fallback to a beautiful procedural-like sky if the heavy HDR fails.
   */
  private applyFallbackSky() {
    logger.warn('[Skybox] Using fallback atmospheric sky');
    const geometry = new THREE.SphereGeometry(200, 64, 32);
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

            // High-quality PMREM generation for 8K HDR
            // Use default high-quality settings (Three.js automatically chooses optimal resolution)
            const envMap = pmremGenerator.fromEquirectangular(texture);
            pmremGenerator.dispose();

            // Apply the properly processed environment map
            current.background = null;
            current.environment = envMap.texture;

            logger.log(`[Skybox] High-quality PMREM environment map applied successfully: texture size=${(envMap.texture.image as any)?.width}x${(envMap.texture.image as any)?.height}`);

            // Log scene lighting status
            logger.log(`[Skybox] Scene lighting: background=${current.background}, environment=${!!current.environment}`);
            logger.log(`[Skybox] Scene children count: ${current.children.length}`);
          } catch (error) {
            logger.warn('[Skybox] PMREMGenerator failed, falling back to direct texture:', error);
            // Fallback to direct texture if PMREM fails
            current.background = null;
            current.environment = texture;
          }
        } else {
          logger.warn('[Skybox] No renderer available, using direct texture');
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

/**
 * Downscale HDR data using bilinear interpolation for better quality than WebGL automatic scaling
 */
function downscaleHDRData(data: Float32Array, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Float32Array {
  const dstData = new Float32Array(dstWidth * dstHeight * 4);

  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      // Calculate source coordinates
      const srcX = dstX * scaleX;
      const srcY = dstY * scaleY;

      // Get integer and fractional parts
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y1 = Math.min(y0 + 1, srcHeight - 1);

      const wx = srcX - x0;
      const wy = srcY - y0;

      // Bilinear interpolation for each channel
      for (let c = 0; c < 4; c++) {
        const idx00 = (y0 * srcWidth + x0) * 4 + c;
        const idx10 = (y0 * srcWidth + x1) * 4 + c;
        const idx01 = (y1 * srcWidth + x0) * 4 + c;
        const idx11 = (y1 * srcWidth + x1) * 4 + c;

        const val00 = data[idx00];
        const val10 = data[idx10];
        const val01 = data[idx01];
        const val11 = data[idx11];

        // Bilinear interpolation
        const val = val00 * (1 - wx) * (1 - wy) +
          val10 * wx * (1 - wy) +
          val01 * (1 - wx) * wy +
          val11 * wx * wy;

        dstData[(dstY * dstWidth + dstX) * 4 + c] = val;
      }
    }
  }

  return dstData;
}
