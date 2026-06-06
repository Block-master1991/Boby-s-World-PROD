// Three.js Core Chunk - Separated for better code splitting
import * as THREE from "three";
export { THREE };

// Core Three.js components used throughout the app
  export {
    ACESFilmicToneMapping, AmbientLight, AnimationClip, AnimationMixer, AxesHelper, Bone, Box3, BoxGeometry, BufferAttribute, BufferGeometry, Camera, CineonToneMapping, Clock, Color, CylinderGeometry, DirectionalLight, Euler, Float32BufferAttribute, Fog, Frustum, BufferGeometry as Geometry, GridHelper, Group, HemisphereLight, InstancedMesh, InterpolateDiscrete, InterpolateLinear, KeyframeTrack, LinearSRGBColorSpace, LinearToneMapping, LoadingManager, LoopRepeat, Material, Matrix4, Mesh, MeshBasicMaterial,
    MeshLambertMaterial, MeshStandardMaterial, Object3D, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Points,
    PointsMaterial, Quaternion, Raycaster, ReinhardToneMapping, Scene, Skeleton,
    SkinnedMesh, Sphere, SphereGeometry, SpotLight, SRGBColorSpace, TextureLoader, PerspectiveCamera as ThreePerspectiveCamera, Uint16BufferAttribute,
    Uint32BufferAttribute, Vector2, Vector3, WebGLRenderer
  } from "three";

// Type exports
export type { Intersection } from "three";

// Loaders and utilities
export { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
export { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
export { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
export { RGBELoader } from "three/addons/loaders/RGBELoader.js";

// Controls (only import what's actually used)
export { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Post-processing (lazy loaded when needed)
export const loadPostProcessing = async () => {
  const [
    { EffectComposer },
    { RenderPass },
    { OutlinePass },
    { FXAAShader },
    { GammaCorrectionShader },
  ] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/OutlinePass.js"),
    import("three/addons/shaders/FXAAShader.js"),
    import("three/addons/shaders/GammaCorrectionShader.js"),
  ]);

  return {
    EffectComposer,
    RenderPass,
    OutlinePass,
    FXAAShader,
    GammaCorrectionShader,
  };
};

// Physics utilities (lazy loaded)
export const loadPhysics = async () => {
  const { OctreeHelper } = await import("three/addons/helpers/OctreeHelper.js");
  return { OctreeHelper };
};

// Math utilities
export { MathUtils } from "three";

// UUID generation utility
export const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Constants
export const THREE_CONSTANTS = {
  PI: Math.PI,
  HALF_PI: Math.PI / 2,
  TWO_PI: Math.PI * 2,
  DEG2RAD: Math.PI / 180,
  RAD2DEG: 180 / Math.PI,
} as const;
