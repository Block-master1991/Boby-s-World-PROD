// Three.js Core Chunk - Separated for better code splitting
import * as THREE from 'three';
export { THREE };

// Core Three.js components used throughout the app
export {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Clock,
    Vector3,
    Vector2,
    Quaternion,
    Matrix4,
    Euler,
    Color,
    Fog,
    TextureLoader,
    LoadingManager,
    AnimationMixer,
    AnimationClip,
    KeyframeTrack,
    InterpolateLinear,
    InterpolateDiscrete,
    LoopRepeat,
    Bone,
    Skeleton,
    SkinnedMesh,
    MeshStandardMaterial,
    MeshBasicMaterial,
    MeshLambertMaterial,
    Material,
    BufferGeometry as Geometry,
    BoxGeometry,
    PlaneGeometry,
    SphereGeometry,
    CylinderGeometry,
    Group,
    Object3D,
    Mesh,
    Points,
    PointsMaterial,
    InstancedMesh,
    BufferGeometry,
    BufferAttribute,
    Float32BufferAttribute,
    Uint16BufferAttribute,
    Uint32BufferAttribute,
    Raycaster,
    Box3,
    Sphere,
    Frustum,
    Camera,
    PerspectiveCamera as ThreePerspectiveCamera,
    OrthographicCamera,
    AxesHelper,
    GridHelper,
    AmbientLight,
    DirectionalLight,
    PointLight,
    SpotLight,
    HemisphereLight,
    PCFSoftShadowMap,
    SRGBColorSpace,
    LinearSRGBColorSpace,
    ACESFilmicToneMapping,
    CineonToneMapping,
    ReinhardToneMapping,
    LinearToneMapping,
} from 'three';

// Type exports
export type {
    Intersection,
} from 'three';

// Loaders and utilities
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
export { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
export { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// Controls (only import what's actually used)
export { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Post-processing (lazy loaded when needed)
export const loadPostProcessing = async () => {
    const [
        { EffectComposer },
        { RenderPass },
        { OutlinePass },
        { FXAAShader },
        { GammaCorrectionShader },
    ] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/OutlinePass.js'),
        import('three/examples/jsm/shaders/FXAAShader.js'),
        import('three/examples/jsm/shaders/GammaCorrectionShader.js'),
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
    const { OctreeHelper } = await import('three/examples/jsm/helpers/OctreeHelper.js');
    return { OctreeHelper };
};

// Math utilities
export {
    MathUtils,
} from 'three';

// UUID generation utility
export const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
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
