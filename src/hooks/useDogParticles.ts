import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

interface UseDogParticlesProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogMeshRef: MutableRefObject<THREE.Object3D | null>;
  dogSpeed: number; // e.g., 0 for idle, >0 for walking/running
  isRunning: boolean; // true if dog is in running animation
}

const useParticleState = () => {
  const particlePositions = useRef<Float32Array>(new Float32Array());
  const particleVelocities = useRef<Float32Array>(new Float32Array());
  const particleOpacities = useRef<Float32Array>(new Float32Array());
  const particleAges = useRef<Float32Array>(new Float32Array());
  const particleMaxAges = useRef<Float32Array>(new Float32Array());
  return { particlePositions, particleVelocities, particleOpacities, particleAges, particleMaxAges };
};

const useParticleInitialization = (sceneRef: MutableRefObject<THREE.Scene | null>, state: ReturnType<typeof useParticleState>) => {
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const particlesGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    particlesGeometryRef.current = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({ color: 0x8B4513, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    state.particlePositions.current = new Float32Array(500 * 3);
    state.particleVelocities.current = new Float32Array(500 * 3);
    state.particleOpacities.current = new Float32Array(500);
    state.particleAges.current = new Float32Array(500).fill(0);
    state.particleMaxAges.current = new Float32Array(500).fill(0);
    particlesGeometryRef.current.setAttribute('position', new THREE.BufferAttribute(state.particlePositions.current, 3));
    particlesGeometryRef.current.setAttribute('opacity', new THREE.BufferAttribute(state.particleOpacities.current, 1));
    particleSystemRef.current = new THREE.Points(particlesGeometryRef.current, material);
    scene.add(particleSystemRef.current);
    return () => {
      if (particleSystemRef.current) {
        scene.remove(particleSystemRef.current);
        particleSystemRef.current.geometry.dispose();
        (particleSystemRef.current.material as THREE.Material).dispose();
      }
    };
  }, [sceneRef]);
  return { particleSystemRef, particlesGeometryRef };
};

const useParticleLifecycle = (
  state: ReturnType<typeof useParticleState>,
  particlesGeometryRef: MutableRefObject<THREE.BufferGeometry | null>
) => {
  const emitParticle = useCallback((position: THREE.Vector3) => {
    if (!particlesGeometryRef.current) return;
    let index = -1;
    for (let i = 0; i < 500; i++) {
        const age = state.particleAges.current[i];
        const maxAge = state.particleMaxAges.current[i];
        if (age !== undefined && maxAge !== undefined && age >= maxAge) { index = i; break; }
    }
    if (index === -1) return;
    const i3 = index * 3;
    state.particlePositions.current[i3] = position.x + (Math.random() - 0.5) * 0.2;
    state.particlePositions.current[i3 + 1] = position.y - 0.1;
    state.particlePositions.current[i3 + 2] = position.z + (Math.random() - 0.5) * 0.2;
    state.particleVelocities.current[i3] = (Math.random() - 0.5) * 0.01;
    state.particleVelocities.current[i3 + 1] = 0.01 + Math.random() * 0.02;
    state.particleVelocities.current[i3 + 2] = (Math.random() - 0.5) * 0.01;
    state.particleOpacities.current[index] = 1.0;
    state.particleAges.current[index] = 0;
    state.particleMaxAges.current[index] = 50 + Math.random() * 50;
  }, [state, particlesGeometryRef]);

  return { emitParticle };
};

const updateSingleParticle = (
  i: number,
  state: ReturnType<typeof useParticleState>,
  positions: Float32Array,
  opacities: Float32Array
) => {
  const i3 = i * 3;
  const age = state.particleAges.current[i];
  const maxAge = state.particleMaxAges.current[i];
  if (age === undefined || maxAge === undefined || age >= maxAge) {
    if (opacities[i] !== undefined) opacities[i] = 0;
    return;
  }
  positions[i3] = (positions[i3] ?? 0) + (state.particleVelocities.current[i3] ?? 0);
  positions[i3 + 1] = (positions[i3 + 1] ?? 0) + (state.particleVelocities.current[i3 + 1] ?? 0);
  positions[i3 + 2] = (positions[i3 + 2] ?? 0) + (state.particleVelocities.current[i3 + 2] ?? 0);
  const vY = state.particleVelocities.current[i3 + 1];
  if (vY !== undefined) state.particleVelocities.current[i3 + 1] = vY - 0.001;
  const newAge = age + 1;
  state.particleAges.current[i] = newAge;
  opacities[i] = 1.0 - (newAge / maxAge);
};

export const useDogParticles = ({ sceneRef, dogMeshRef, dogSpeed, isRunning }: UseDogParticlesProps) => {
  const state = useParticleState();
  const { particleSystemRef, particlesGeometryRef } = useParticleInitialization(sceneRef, state);
  const { emitParticle } = useParticleLifecycle(state, particlesGeometryRef);

  const updateParticles = useCallback(() => {
    const geom = particlesGeometryRef.current;
    if (!particleSystemRef.current || !geom || !dogMeshRef.current) return;
    const posAttr = geom.attributes['position'];
    const opacAttr = geom.attributes['opacity'];
    if (!posAttr || !opacAttr) return;
    const positions = posAttr.array as Float32Array;
    const opacities = opacAttr.array as Float32Array;
    if (dogSpeed > 0.01) {
      const rate = isRunning ? 1.5 : 0.5;
      for (let i = 0; i < Math.floor(rate); i++) emitParticle(dogMeshRef.current.position);
      if (Math.random() < (rate % 1)) emitParticle(dogMeshRef.current.position);
    }
    for (let i = 0; i < 500; i++) updateSingleParticle(i, state, positions, opacities);
    posAttr.needsUpdate = true;
    opacAttr.needsUpdate = true;
  }, [dogMeshRef, dogSpeed, isRunning, emitParticle, state, particlesGeometryRef, particleSystemRef]);

  return { updateParticles };
};
