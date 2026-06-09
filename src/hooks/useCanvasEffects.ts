import DogShieldEffect from "@/components/game/DogShieldEffect";
import DogSpeedBeam from "@/components/game/DogSpeedBeam";
import type { DogTransform } from "@/hooks/dog/constants";
import { initializeGPUInstancing } from "@/lib/gpu-instancing";
import { initializeLODManager } from "@/lib/lod/lod-manager";
import { initializeObjectPooling } from "@/lib/object-pooling";
import { Environment } from "@/lib/world-generation/environment-generator/environment";
import type { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect } from "react";
import type * as THREE from "three";

interface UseCanvasEffectsProps {
  sessionPublicKey: PublicKey | null;
  isPaused: boolean;
  isCoinMagnetActive: boolean;
  isSpeedBoostActive: boolean;
  isShieldActive: boolean;
  mountRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  dogModelRef: React.MutableRefObject<THREE.Object3D | null>;
  lastDogTransformRef: React.MutableRefObject<DogTransform | null>;
  prevSessionPublicKeyRef: React.MutableRefObject<PublicKey | null>;
  environmentRef: React.MutableRefObject<Environment | null>;
  speedBeamRef: React.MutableRefObject<DogSpeedBeam | null>;
  shieldEffectRef: React.MutableRefObject<DogShieldEffect | null>;
  animationFrameId: React.MutableRefObject<number | null>;
  handleResize: () => void;
  cleanupScene: () => void;
  resetDogState: () => void;
  resetCamera: () => void;
  initializeCamera: () => void;
  initializeScene: () => boolean;
  loadAllGameAssets: () => Promise<void>;
  setupGameWorldAndComplete: () => Promise<void>;
  setupInitialCameraPosition: () => void;
  animate: () => void;
  activateMagnetEffect: () => void;
  deactivateMagnetEffect: () => void;
  activateSpeedBeam: () => void;
  deactivateSpeedBeam: () => void;
  activateShieldEffect: () => void;
  deactivateShieldEffect: () => void;
  cleanupFloatingEffects: () => void;
  trackError: (error: Error, info: { type: string }) => void;
  trackGameEvent: (name: string) => void;
  trackUserAction: (action: string) => void;
}

export const useCanvasEffects = (p: UseCanvasEffectsProps) => {
  useEffect(() => {
    if (p.isCoinMagnetActive) p.activateMagnetEffect();
    else p.deactivateMagnetEffect();
  }, [p.isCoinMagnetActive, p.activateMagnetEffect, p.deactivateMagnetEffect]);
  useEffect(() => {
    if (p.isSpeedBoostActive) p.activateSpeedBeam();
    else p.deactivateSpeedBeam();
  }, [p.isSpeedBoostActive, p.activateSpeedBeam, p.deactivateSpeedBeam]);
  useEffect(() => {
    if (p.isShieldActive) p.activateShieldEffect();
    else p.deactivateShieldEffect();
  }, [p.isShieldActive, p.activateShieldEffect, p.deactivateShieldEffect]);

  const initializeGameSession = useCallback(() => {
    if (p.rendererRef.current) p.cleanupScene();
    p.resetDogState();
    p.resetCamera();
    p.initializeCamera();
    if (p.initializeScene() && p.cameraRef.current && p.rendererRef.current && p.sceneRef.current) {
      initializeGPUInstancing(p.cameraRef.current);
      initializeLODManager();
      initializeObjectPooling();
      p.environmentRef.current = new Environment(p.rendererRef.current);
      p.sceneRef.current.add(p.environmentRef.current);
      const dP =
        p.dogModelRef.current?.position ||
        p.lastDogTransformRef.current?.position ||
        ({ x: 0, y: 0, z: 0 } as THREE.Vector3);
      const dR =
        (p.dogModelRef.current?.rotation as THREE.Euler) ||
        ({ x: 0, y: 0, z: 0 } as unknown as THREE.Euler);
      p.speedBeamRef.current = new DogSpeedBeam({
        scene: p.sceneRef.current,
        dogPosition: dP,
        dogRotation: dR,
      });
      p.shieldEffectRef.current = new DogShieldEffect({
        scene: p.sceneRef.current,
        dogPosition: dP,
      });
      p.loadAllGameAssets().then(() => p.setupGameWorldAndComplete());
    }
  }, [
    p.cleanupScene,
    p.resetDogState,
    p.resetCamera,
    p.initializeCamera,
    p.initializeScene,
    p.cameraRef,
    p.rendererRef,
    p.sceneRef,
    p.environmentRef,
    p.dogModelRef,
    p.lastDogTransformRef,
    p.speedBeamRef,
    p.shieldEffectRef,
    p.loadAllGameAssets,
    p.setupGameWorldAndComplete,
  ]);

  useEffect(() => {
    if (!p.mountRef.current || !p.sessionPublicKey) return;
    const isNew =
      !p.prevSessionPublicKeyRef.current ||
      !p.sessionPublicKey.equals(p.prevSessionPublicKeyRef.current) ||
      !p.rendererRef.current;
    if (isNew) initializeGameSession();
    p.prevSessionPublicKeyRef.current = p.sessionPublicKey;
  }, [
    p.sessionPublicKey,
    p.mountRef,
    p.prevSessionPublicKeyRef,
    p.rendererRef,
    initializeGameSession,
  ]);

  useEffect(() => {
    if (!p.sessionPublicKey || !p.rendererRef.current) return;
    const isResuming =
      p.prevSessionPublicKeyRef.current?.equals(p.sessionPublicKey) &&
      !p.isPaused &&
      p.dogModelRef.current &&
      p.lastDogTransformRef.current;
    if (isResuming && p.dogModelRef.current && p.lastDogTransformRef.current) {
      p.dogModelRef.current.position.copy(p.lastDogTransformRef.current.position);
      p.dogModelRef.current.rotation.y = p.lastDogTransformRef.current.rotationY;
      if (p.cameraRef.current) p.setupInitialCameraPosition();
    }
    if (
      !p.animationFrameId.current &&
      p.rendererRef.current &&
      p.sceneRef.current &&
      p.cameraRef.current
    )
      p.animate();
  }, [
    p.sessionPublicKey,
    p.isPaused,
    p.setupInitialCameraPosition,
    p.animate,
    p.dogModelRef,
    p.lastDogTransformRef,
    p.rendererRef,
    p.cameraRef,
    p.sceneRef,
    p.prevSessionPublicKeyRef,
    p.animationFrameId,
  ]);

  useEffect(() => {
    window.addEventListener("resize", p.handleResize);
    p.handleResize();
    return () => window.removeEventListener("resize", p.handleResize);
  }, [p.handleResize]);
  useEffect(() => {
    const h = (e: PromiseRejectionEvent) =>
      p.trackError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)), {
        type: "unhandled_rejection",
      });
    window.addEventListener("unhandledrejection", h);
    return () => window.removeEventListener("unhandledrejection", h);
  }, [p.trackError]);
  useEffect(() => {
    p.trackGameEvent("canvas_init");
    p.trackUserAction("start_game_initialization");
  }, [p.trackGameEvent, p.trackUserAction]);
  useEffect(
    () => () => {
      if (p.animationFrameId.current) cancelAnimationFrame(p.animationFrameId.current);
      p.cleanupScene();
      p.cleanupFloatingEffects();
      p.speedBeamRef.current?.dispose();
      p.shieldEffectRef.current?.dispose();
    },
    [
      p.cleanupScene,
      p.cleanupFloatingEffects,
      p.animationFrameId,
      p.speedBeamRef,
      p.shieldEffectRef,
    ]
  );
};
