import * as THREE from 'three';
import { degToRad } from 'three/src/math/MathUtils.js';
import fragmentShader from './shaders/skybox.frag?raw';
import vertexShader from './shaders/skybox.vert?raw';

export class SkyboxOptions {
  public sunAzimuth: number;
  public sunElevation: number;
  public sunColor: THREE.Color;
  public sunSize: number;
  public skyColorLow: THREE.Color;
  public skyColorHigh: THREE.Color;

  constructor() {
    /**
     * Azimuth of the sun in degrees
     */
    this.sunAzimuth = 90;

    /**
     * Elevation of the sun in degrees
     */
    this.sunElevation = 30;

    /**
     * Color of the sun
     */
    this.sunColor = new THREE.Color(0xffe5b0).convertLinearToSRGB();

    /**
     * Size of the sun in the sky
     */
    this.sunSize = 1;

    /**
     * Color of the sky in the lower part of the sky
     */
    this.skyColorLow = new THREE.Color(0x6fa2ef).convertLinearToSRGB();

    /**
     * Color of the sun in the higher part of the sky
     */
    this.skyColorHigh = new THREE.Color(0x2053ff).convertLinearToSRGB();
  }
}

/**
 * Configurable skybox with sun and built-in lighting
 */
export class Skybox extends THREE.Mesh {
  public sun: THREE.DirectionalLight;
  public material: THREE.ShaderMaterial;

  constructor(options: SkyboxOptions = new SkyboxOptions()) {
    super();

    this.name = 'Skybox';

    // Create a box geometry and apply the skybox material
    this.geometry = new THREE.SphereGeometry(5000, 900, 900);

    // Create the skybox material with the shaders
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSunAzimuth: { value: options.sunAzimuth },
        uSunElevation: { value: options.sunElevation },
        uSunColor: { value: options.sunColor },
        uSkyColorLow: { value: options.skyColorLow },
        uSkyColorHigh: { value: options.skyColorHigh },
        uSunSize: { value: options.sunSize }
      },
      side: THREE.BackSide
    });

    this.sun = new THREE.DirectionalLight();
    this.sun.intensity = 5;
    this.sun.color = options.sunColor;
    this.sun.position.set(50, 100, 50);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.mapSize = new THREE.Vector2(512, 512);
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.2;
    this.add(this.sun);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.add(ambientLight);

    this.updateSunPosition();
  }

  updateSunPosition() {
    const el = degToRad(this.sunElevation);
    const az = degToRad(this.sunAzimuth);

    this.sun.position.set(
      100 * Math.cos(el) * Math.sin(az),
      100 * Math.sin(el),
      100 * Math.cos(el) * Math.cos(az)
    );
  }

  get sunAzimuth(): number {
    return this.material.uniforms.uSunAzimuth.value;
  }

  set sunAzimuth(azimuth: number) {
    this.material.uniforms.uSunAzimuth.value = azimuth;
    this.updateSunPosition();
  }

  get sunElevation(): number {
    return this.material.uniforms.uSunElevation.value;
  }

  set sunElevation(elevation: number) {
    this.material.uniforms.uSunElevation.value = elevation;
    this.updateSunPosition();
  }

  get sunColor(): THREE.Color {
    return this.material.uniforms.uSunColor.value;
  }

  set sunColor(color: THREE.Color) {
    this.material.uniforms.uSunColor.value = color;
    this.sun.color = color;
  }

  get skyColorLow(): THREE.Color {
    return this.material.uniforms.uSkyColorLow.value;
  }

  set skyColorLow(color: THREE.Color) {
    this.material.uniforms.uSkyColorLow.value = color;
  }

  get skyColorHigh(): THREE.Color {
    return this.material.uniforms.uSkyColorHigh.value;
  }

  set skyColorHigh(color: THREE.Color) {
    this.material.uniforms.uSkyColorHigh.value = color;
  }

  get sunSize(): number {
    return this.material.uniforms.uSunSize.value;
  }

  set sunSize(size: number) {
    this.material.uniforms.uSunSize.value = size;
  }
}
