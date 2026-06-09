import * as THREE from "three";
import { logger } from "utils/logger";
import { getModel, putModel } from "../../indexedDB";
import { getDevicePerformanceConfig } from "../../utils";

export interface DevicePerformanceConfig {
  isMobile: boolean;
  performanceLevel: "low" | "medium" | "high";
  environmentDensity: {
    grassMultiplier: number;
    treeMultiplier: number;
    rocksMultiplier: number;
    flowersMultiplier: number;
  };
  renderer: {
    antialias: boolean;
    shadowMapSize: number;
    pixelRatio: number;
  };
  game: {
    fpsLimit: number;
    animationUpdates: boolean;
  };
}

export class Skybox extends THREE.Object3D {
  public sun: THREE.DirectionalLight;
  public sunPosition = new THREE.Vector3();
  private skyMesh: THREE.Mesh | null = null;
  public loadingPromise: Promise<void>;
  private resolveLoading!: () => void;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(renderer?: THREE.WebGLRenderer) {
    super();
    this.renderer = renderer || null;
    this.name = "Skybox";

    this.loadingPromise = new Promise(resolve => {
      this.resolveLoading = resolve;
    });

    const perfConfig = getDevicePerformanceConfig();
    this.sun = new THREE.DirectionalLight(0xffffff, 5);
    this.sun.castShadow = !perfConfig.isMobile;

    const SHADOW_SIZE = 200;
    this.sun.shadow.camera.left = -SHADOW_SIZE;
    this.sun.shadow.camera.right = SHADOW_SIZE;
    this.sun.shadow.camera.top = SHADOW_SIZE;
    this.sun.shadow.camera.bottom = -SHADOW_SIZE;
    this.sun.shadow.camera.far = 2500;

    this.sun.shadow.mapSize.set(
      perfConfig.renderer.shadowMapSize,
      perfConfig.renderer.shadowMapSize
    );
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.add(this.sun);
    this.add(this.sun.target);

    this.sunPosition.set(100, 200, 150).normalize();
    this.sun.position.copy(this.sunPosition).multiplyScalar(1000);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.add(ambient);

    this.loadHDR();
  }

  /* eslint-disable no-await-in-loop */
  private async loadHDR(maxAttempts: number = 3) {
    const hdrUrl = "/textures/hdr/citrus_orchard_road_puresky_8k.hdr";
    const modelName = "hdr_data";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Always fetch fresh data - previous attempts may have detached the buffer via Transferable
        const hdrData = await this.fetchHDRData(hdrUrl, modelName);

        if (!hdrData || hdrData.byteLength === 0) {
          throw new Error(`HDR data is empty or detached (byteLength: ${hdrData?.byteLength ?? 0})`);
        }

        logger.log(`[Skybox] HDR data fetched: ${(hdrData.byteLength / 1048576).toFixed(2)}MB, attempt ${attempt}`);

        // Try Worker-based parsing first, fall back to main thread
        const useWorker = attempt <= 1;
        if (useWorker) {
          await this.loadHDRViaWorker(hdrData);
        } else {
          await this.loadHDRMainThread(hdrData);
        }

        logger.log(`[Skybox] ✅ HDR Load successful on attempt ${attempt} (${useWorker ? "worker" : "main-thread"})`);
        if (this.resolveLoading) this.resolveLoading();
        return; // Success!
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[Skybox] ❌ HDR Loading attempt ${attempt} failed: ${errMsg}`);
        if (attempt === maxAttempts) {
          logger.error("[Skybox] 🚨 All HDR loading attempts failed. Using fallback.");
          this.applyFallbackSky();
          if (this.resolveLoading) this.resolveLoading();
        } else {
          const delay = Math.min(500 * attempt, 2000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  private async loadHDRViaWorker(hdrData: ArrayBuffer): Promise<void> {
    // Use pre-built worker file from public/ to avoid import.meta.url issues in Next.js
    const workerUrl = new URL('/workers/hdrWorker.js', window.location.origin).href;
    const worker = new Worker(workerUrl);

    try {
      await new Promise<void>((resolve, reject) => {
        const workerTimeout = setTimeout(() => {
          worker.terminate();
          reject(new Error("HDR Worker timeout"));
        }, 60000);

        worker.onmessage = e => {
          const { status, width, height, data, error } = e.data;
          if (status === "progress") return;

          clearTimeout(workerTimeout);
          if (status === "success") {
            this.processHDRResult(width, height, data, e.data.isHalf);
            worker.terminate();
            resolve();
          } else {
            worker.terminate();
            reject(new Error(error || "Worker failed"));
          }
        };

        worker.onerror = err => {
          clearTimeout(workerTimeout);
          worker.terminate();
          const errMsg = err instanceof ErrorEvent
            ? `Worker load error: ${err.message} (${err.filename}:${err.lineno}:${err.colno})`
            : `Worker error: ${String(err)}`;
          reject(new Error(errMsg));
        };

        // Transfer the buffer (zero-copy) to the worker
        worker.postMessage({ buffer: hdrData }, [hdrData]);
      });
    } catch (workerError) {
      logger.warn(`[Skybox] Worker failed, will retry on main thread: ${workerError instanceof Error ? workerError.message : String(workerError)}`);
      throw workerError;
    }
  }

  private async loadHDRMainThread(hdrData: ArrayBuffer): Promise<void> {
    logger.log("[Skybox] Processing HDR on main thread (fallback)...");
    const { parseHeader, decodeScanline, rgbeToFloat32, calculateDownscaleTarget, processDownscaling } = await import("../../../workers/hdrUtils");

    const bytes = new Uint8Array(hdrData);
    const dims = parseHeader(bytes);
    if (!dims || dims.width <= 0 || dims.height <= 0) {
      throw new Error("Invalid HDR dimensions from main thread parser");
    }

    const { width: srcWidth, height: srcHeight, endPos } = dims;
    const { targetWidth, targetHeight } = calculateDownscaleTarget(srcWidth, srcHeight);
    const isDownscaling = targetWidth !== srcWidth || targetHeight !== srcHeight;
    const scaleX = srcWidth / targetWidth;
    const scaleY = srcHeight / targetHeight;

    logger.log(`[Skybox] Main thread HDR: ${srcWidth}x${srcHeight} -> ${targetWidth}x${targetHeight}`);

    const finalData = new Float32Array(targetWidth * targetHeight * 4);
    const scanline = new Uint8Array(4 * srcWidth);
    const srcRgbaLine = new Float32Array(srcWidth * 4);
    let pos = endPos;

    for (let y = 0; y < srcHeight; y++) {
      const { newPos, success } = decodeScanline(scanline, bytes, pos, srcWidth);
      if (!success) throw new Error(`HDR decode failed at scanline ${y}`);
      pos = newPos;

      rgbeToFloat32(scanline, srcRgbaLine, srcWidth);

      if (!isDownscaling) {
        finalData.set(srcRgbaLine, y * srcWidth * 4);
      } else {
        processDownscaling({ y, targetWidth, targetHeight, scaleX, scaleY, srcRgbaLine, finalData });
      }

      // Yield to main thread every 64 scanlines to avoid blocking
      if (y % 64 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.processHDRResult(targetWidth, targetHeight, finalData, false);
  }
  /* eslint-enable no-await-in-loop */

  private async fetchHDRData(url: string, name: string): Promise<ArrayBuffer> {
    let data = await getModel(name);
    if (!data) {
      logger.log(`[Skybox] Fetching HDR from network: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      data = await response.arrayBuffer();
      await putModel(name, data);
    } else {
      logger.log(`[Skybox] Loading HDR from IndexedDB: ${name}`);
    }
    return data;
  }

  private processHDRResult(
    width: number,
    height: number,
    data: Float32Array | Uint16Array,
    isHalf: boolean
  ) {
    const maxTextureSize = this.renderer?.capabilities?.maxTextureSize || 4096;
    let finalWidth = width;
    let finalHeight = height;
    let finalData = data;

    if (width > maxTextureSize || height > maxTextureSize) {
      const scaleFactor = Math.min(maxTextureSize / width, maxTextureSize / height);
      finalWidth = Math.floor(width * scaleFactor);
      finalHeight = Math.floor(height * scaleFactor);
      const options = {
        srcWidth: width,
        srcHeight: height,
        dstWidth: finalWidth,
        dstHeight: finalHeight,
      };
      finalData = downscaleHDRData(data as Float32Array, options);
    }

    const type = isHalf ? THREE.HalfFloatType : THREE.FloatType;
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
    texture.flipY = true;
    texture.needsUpdate = true;

    this.setupSkyMesh(texture, getDevicePerformanceConfig());
    this.applyToScene(texture);
  }

  private setupSkyMesh(texture: THREE.Texture, perfConfig: DevicePerformanceConfig) {
    const isHighEndGPU = perfConfig.renderer.shadowMapSize >= 2048;
    const segments = perfConfig.isMobile ? 96 : isHighEndGPU ? 192 : 128;
    const rings = perfConfig.isMobile ? 48 : isHighEndGPU ? 96 : 64;
    const geometry = new THREE.SphereGeometry(200, segments, rings);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false,
      fog: false,
    });

    if (this.skyMesh) {
      this.remove(this.skyMesh);
      this.skyMesh.geometry.dispose();
      if (this.skyMesh.material instanceof THREE.Material) this.skyMesh.material.dispose();
    }

    this.skyMesh = new THREE.Mesh(geometry, material);
    this.skyMesh.name = "SkySphereMesh";
    this.skyMesh.renderOrder = 1000;
    this.add(this.skyMesh);
  }

  private applyFallbackSky() {
    logger.warn("[Skybox] Using fallback atmospheric sky");
    const geometry = new THREE.SphereGeometry(200, 64, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(geometry, material);
    this.add(this.skyMesh);
  }

  private applyToScene(texture: THREE.Texture) {
    const findAndApply = () => {
      let scene: THREE.Scene | null = null;
      this.traverseAncestors(ancestor => {
        if (ancestor instanceof THREE.Scene) scene = ancestor;
      });

      if (scene) {
        if (this.renderer) {
          try {
            const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            pmremGenerator.compileEquirectangularShader();
            const envMap = pmremGenerator.fromEquirectangular(texture);
            pmremGenerator.dispose();
            (scene as THREE.Scene).background = null;
            (scene as THREE.Scene).environment = envMap.texture;
          } catch (error) {
            logger.warn("[Skybox] PMREMGenerator failed:", error);
            (scene as THREE.Scene).environment = texture;
          }
        } else {
          (scene as THREE.Scene).environment = texture;
        }
      } else {
        setTimeout(findAndApply, 100);
      }
    };
    findAndApply();
  }

  public update(elapsedTime: number) {
    if (this.skyMesh) this.skyMesh.rotation.y = elapsedTime * 0.0025;
    this.sun.position.copy(this.sunPosition).multiplyScalar(1000);
    this.sun.target.position.set(0, 0, 0);
    this.sun.target.updateMatrixWorld();
  }

  public updateSky() {
    /* Deprecated */
  }
  get sunElevation() {
    return 20;
  }
  set sunElevation(_v: number) {}
  get sunAzimuth() {
    return 180;
  }
  set sunAzimuth(_v: number) {}
}

function downscaleHDRData(
  data: Float32Array,
  options: { srcWidth: number; srcHeight: number; dstWidth: number; dstHeight: number }
): Float32Array {
  const { srcWidth, srcHeight, dstWidth, dstHeight } = options;
  const dstData = new Float32Array(dstWidth * dstHeight * 4);
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;

  for (let dstY = 0; dstY < dstHeight; dstY++) {
    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const srcX = dstX * scaleX;
      const srcY = dstY * scaleY;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y1 = Math.min(y0 + 1, srcHeight - 1);
      const wx = srcX - x0;
      const wy = srcY - y0;

      for (let c = 0; c < 4; c++) {
        const val00 = data[(y0 * srcWidth + x0) * 4 + c] ?? 0;
        const val10 = data[(y0 * srcWidth + x1) * 4 + c] ?? 0;
        const val01 = data[(y1 * srcWidth + x0) * 4 + c] ?? 0;
        const val11 = data[(y1 * srcWidth + x1) * 4 + c] ?? 0;
        dstData[(dstY * dstWidth + dstX) * 4 + c] =
          val00 * (1 - wx) * (1 - wy) +
          val10 * wx * (1 - wy) +
          val01 * (1 - wx) * wy +
          val11 * wx * wy;
      }
    }
  }
  return dstData;
}
