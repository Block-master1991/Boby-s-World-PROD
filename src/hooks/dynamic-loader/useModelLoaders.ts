import { useEffect, useRef } from "react";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACO_DECODER_PATH } from "./constants";

export const useModelLoaders = () => {
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);

  useEffect(() => {
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    const gltf = new GLTFLoader();
    gltf.setDRACOLoader(draco);

    dracoLoaderRef.current = draco;
    gltfLoaderRef.current = gltf;

    return () => {
      draco.dispose();
      gltfLoaderRef.current = null;
      dracoLoaderRef.current = null;
    };
  }, []);

  return { gltfLoaderRef, dracoLoaderRef };
};
