import * as THREE from "three";
import { BarkType, LeafType } from "./enums";

// Define texture paths for access in browser environment
const texturePaths = {
  birchAo: "/textures/ez-tree/bark/birch_ao_1k.jpg",
  birchColor: "/textures/ez-tree/bark/birch_color_1k.jpg",
  birchNormal: "/textures/ez-tree/bark/birch_normal_1k.jpg",
  birchRoughness: "/textures/ez-tree/bark/birch_roughness_1k.jpg",

  oakAo: "/textures/ez-tree/bark/oak_ao_1k.jpg",
  oakColor: "/textures/ez-tree/bark/oak_color_1k.jpg",
  oakNormal: "/textures/ez-tree/bark/oak_normal_1k.jpg",
  oakRoughness: "/textures/ez-tree/bark/oak_roughness_1k.jpg",

  pineAo: "/textures/ez-tree/bark/pine_ao_1k.jpg",
  pineColor: "/textures/ez-tree/bark/pine_color_1k.jpg",
  pineNormal: "/textures/ez-tree/bark/pine_normal_1k.jpg",
  pineRoughness: "/textures/ez-tree/bark/pine_roughness_1k.jpg",

  willowAo: "/textures/ez-tree/bark/willow_ao_1k.jpg",
  willowColor: "/textures/ez-tree/bark/willow_color_1k.jpg",
  willowNormal: "/textures/ez-tree/bark/willow_normal_1k.jpg",
  willowRoughness: "/textures/ez-tree/bark/willow_roughness_1k.jpg",

  ashLeaves: "/textures/ez-tree/leaves/ash_color.png",
  aspenLeaves: "/textures/ez-tree/leaves/aspen_color.png",
  oakLeaves: "/textures/ez-tree/leaves/oak_color.png",
  pineLeaves: "/textures/ez-tree/leaves/pine_color.png",
};

const textureLoader = new THREE.TextureLoader();

interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
  blurWidth?: number;
  blurHeight?: number;
}

const loadTexture = (image: string | StaticImageData, srgb: boolean = true): THREE.Texture => {
  let url: string;

  if (typeof image === "string") {
    // If the texture name exists in texturePaths, use the specified path
    url = texturePaths[image as keyof typeof texturePaths] || image;
  } else {
    url = image.src;
  }

  const texture = textureLoader.load(url);
  texture.premultiplyAlpha = true;
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  return texture;
};

const textures = {
  bark: {
    [BarkType.Birch]: {
      ao: loadTexture("birchAo", false),
      color: loadTexture("birchColor"),
      normal: loadTexture("birchNormal", false),
      roughness: loadTexture("birchRoughness", false),
    },
    [BarkType.Oak]: {
      ao: loadTexture("oakAo", false),
      color: loadTexture("oakColor"),
      normal: loadTexture("oakNormal", false),
      roughness: loadTexture("oakRoughness", false),
    },
    [BarkType.Pine]: {
      ao: loadTexture("pineAo", false),
      color: loadTexture("pineColor"),
      normal: loadTexture("pineNormal", false),
      roughness: loadTexture("pineRoughness", false),
    },
    [BarkType.Willow]: {
      ao: loadTexture("willowAo", false),
      color: loadTexture("willowColor"),
      normal: loadTexture("willowNormal", false),
      roughness: loadTexture("willowRoughness", false),
    },
  },
  leaves: {
    [LeafType.Ash]: loadTexture("ashLeaves"),
    [LeafType.Aspen]: loadTexture("aspenLeaves"),
    [LeafType.Oak]: loadTexture("oakLeaves"),
    [LeafType.Pine]: loadTexture("pineLeaves"),
  },
};

export function getBarkTexture(
  type: BarkType,
  mapType: "ao" | "color" | "normal" | "roughness",
  textureScale: { x: number; y: number }
): THREE.Texture | null {
  const texture = textures.bark[type][mapType];
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.x = textureScale.x;
  texture.repeat.y = 1 / textureScale.y;
  return texture;
}

export function getLeafTexture(type: LeafType): THREE.Texture | null {
  return textures.leaves[type];
}
