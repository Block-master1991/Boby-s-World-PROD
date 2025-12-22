import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class SkyboxOptions {
  public turbidity: number;
  public rayleigh: number;
  public mieCoefficient: number;
  public mieDirectionalG: number;
  public elevation: number;
  public azimuth: number;
  public exposure: number;

  constructor() {
    this.turbidity = 0.5; // Lower turbidity for clearer sun
    this.rayleigh = 3.0; // Higher rayleigh for more vibrant sky color
    this.mieCoefficient = 0.005;
    this.mieDirectionalG = 0.95; // Stronger glow around sun
    this.elevation = 20; // Default elevation for a nice daylight look
    this.azimuth = 180;
    this.exposure = 0.5;
  }
}

/**
 * Professional physically-based sky using Rayleigh and Mie scattering models.
 */
export class Skybox extends THREE.Object3D {
  public sky: Sky;
  public sun: THREE.DirectionalLight;
  public sunPosition = new THREE.Vector3();
  private options: SkyboxOptions;

  constructor(options: SkyboxOptions = new SkyboxOptions()) {
    super();
    this.name = 'Skybox';
    this.options = options;

    // Create the Sky object
    this.sky = new Sky();
    this.sky.scale.setScalar(4000); // Scaled down to fit within Camera's Far Plane (5000)
    this.sky.frustumCulled = false; // Ensure it stays visible
    this.add(this.sky);

    // Create a directional light to act as the Sun's light source
    this.sun = new THREE.DirectionalLight(0xffffff, 6); // Increased base intensity
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = -200; // Expanded shadow range
    this.sun.shadow.camera.right = 200;
    this.sun.shadow.camera.top = 200;
    this.sun.shadow.camera.bottom = -200;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0001;
    this.add(this.sun);

    // Add a dedicated ambient light for the sky to brighten overall scene
    const ambient = new THREE.AmbientLight(0xffffff, 1.2); // Strong fill light
    this.add(ambient);

    // Initial update
    this.updateSky();
  }

  public updateSky() {
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = this.options.turbidity;
    uniforms['rayleigh'].value = this.options.rayleigh;
    uniforms['mieCoefficient'].value = this.options.mieCoefficient;
    uniforms['mieDirectionalG'].value = this.options.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - this.options.elevation);
    const theta = THREE.MathUtils.degToRad(this.options.azimuth);

    this.sunPosition.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(this.sunPosition);

    // Update the light's position to follow the sun's direction
    // We scale it up so the shadows are cast from a "distant" source
    this.sun.position.copy(this.sunPosition).multiplyScalar(200);

    // Auto-adjust light intensity based on elevation (dimmer near horizon)
    const intensityFactor = Math.max(0, Math.sin(THREE.MathUtils.degToRad(this.options.elevation)));
    this.sun.intensity = 2.0 + intensityFactor * 5.0; // Boosted intensity range (2.0 to 7.0)
  }

  // Getters and Setters for compatibility with any existing external controls
  get sunElevation(): number { return this.options.elevation; }
  set sunElevation(v: number) {
    this.options.elevation = v;
    this.updateSky();
  }

  get sunAzimuth(): number { return this.options.azimuth; }
  set sunAzimuth(v: number) {
    this.options.azimuth = v;
    this.updateSky();
  }
}
