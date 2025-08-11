import { useRef, useCallback, MutableRefObject, useEffect } from 'react';
import * as THREE from 'three';

interface UseDogParticlesProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogMeshRef: MutableRefObject<THREE.Object3D | null>;
  dogSpeed: number; // e.g., 0 for idle, >0 for walking/running
  isRunning: boolean; // true if dog is in running animation
}

export const useDogParticles = ({ sceneRef, dogMeshRef, dogSpeed, isRunning }: UseDogParticlesProps) => {
  const particleSystemRef = useRef<THREE.Points | null>(null);
  const particlesGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const particlesMaterialRef = useRef<THREE.PointsMaterial | null>(null);
  const particlePositions = useRef<Float32Array>(new Float32Array());
  const particleVelocities = useRef<Float32Array>(new Float32Array());
  const particleOpacities = useRef<Float32Array>(new Float32Array());
  const particleAges = useRef<Float32Array>(new Float32Array());
  const particleMaxAges = useRef<Float32Array>(new Float32Array());

  const maxParticles = 500; // Max number of particles
  const particleSize = 0.05;
  const baseEmissionRate = 0.5; // Particles per frame when walking
  const runningEmissionMultiplier = 3; // Multiplier when running

  useEffect(() => {
    if (!sceneRef.current) return;

    particlesGeometryRef.current = new THREE.BufferGeometry();
    particlesMaterialRef.current = new THREE.PointsMaterial({
      color: 0x8B4513, // Brown color for dust
      size: particleSize,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: false, // We'll manage opacity via attributes
    });

    particlePositions.current = new Float32Array(maxParticles * 3);
    particleVelocities.current = new Float32Array(maxParticles * 3);
    particleOpacities.current = new Float32Array(maxParticles);
    particleAges.current = new Float32Array(maxParticles);
    particleMaxAges.current = new Float32Array(maxParticles);

    particlesGeometryRef.current.setAttribute('position', new THREE.BufferAttribute(particlePositions.current, 3));
    particlesGeometryRef.current.setAttribute('opacity', new THREE.BufferAttribute(particleOpacities.current, 1)); // Custom attribute for opacity

    particleSystemRef.current = new THREE.Points(particlesGeometryRef.current, particlesMaterialRef.current);
    sceneRef.current.add(particleSystemRef.current);

    return () => {
      if (particleSystemRef.current) {
        sceneRef.current?.remove(particleSystemRef.current);
        particleSystemRef.current.geometry.dispose();
        (particleSystemRef.current.material as THREE.Material).dispose();
      }
    };
  }, [sceneRef]);

  const emitParticle = useCallback((position: THREE.Vector3) => {
    if (!particlesGeometryRef.current) return;

    let index = -1;
    // Find an inactive particle slot
    for (let i = 0; i < maxParticles; i++) {
      if (particleAges.current[i] >= particleMaxAges.current[i]) {
        index = i;
        break;
      }
    }

    if (index === -1) return; // No available particle slots

    const i3 = index * 3;
    const i1 = index;

    // Initial position (slightly behind and below the dog's feet)
    particlePositions.current[i3] = position.x + (Math.random() - 0.5) * 0.2;
    particlePositions.current[i3 + 1] = position.y - 0.1; // Slightly below dog
    particlePositions.current[i3 + 2] = position.z + (Math.random() - 0.5) * 0.2;

    // Initial velocity (upwards and slightly outwards)
    particleVelocities.current[i3] = (Math.random() - 0.5) * 0.01;
    particleVelocities.current[i3 + 1] = 0.01 + Math.random() * 0.02; // Upwards
    particleVelocities.current[i3 + 2] = (Math.random() - 0.5) * 0.01;

    particleOpacities.current[i1] = 1.0;
    particleAges.current[i1] = 0;
    particleMaxAges.current[i1] = 50 + Math.random() * 50; // Particle lifetime in frames
  }, []);

  const updateParticles = useCallback(() => {
    if (!particleSystemRef.current || !particlesGeometryRef.current || !dogMeshRef.current) return;

    const positions = particlesGeometryRef.current.attributes.position.array as Float32Array;
    const opacities = particlesGeometryRef.current.attributes.opacity.array as Float32Array;

    // Emit new particles based on dog's movement
    if (dogSpeed > 0.01) { // Only emit if dog is moving
      const emissionRate = isRunning ? baseEmissionRate * runningEmissionMultiplier : baseEmissionRate;
      const numToEmit = Math.floor(emissionRate);
      for (let i = 0; i < numToEmit; i++) {
        emitParticle(dogMeshRef.current.position);
      }
      if (Math.random() < (emissionRate - numToEmit)) { // Fractional emission
        emitParticle(dogMeshRef.current.position);
      }
    }

    // Update existing particles
    for (let i = 0; i < maxParticles; i++) {
      const i3 = i * 3;
      const i1 = i;

      if (particleAges.current[i1] < particleMaxAges.current[i1]) {
        // Update position based on velocity
        positions[i3] += particleVelocities.current[i3];
        positions[i3 + 1] += particleVelocities.current[i3 + 1];
        positions[i3 + 2] += particleVelocities.current[i3 + 2];

        // Apply gravity (simple downward force)
        particleVelocities.current[i3 + 1] -= 0.001;

        // Update opacity based on age
        particleAges.current[i1]++;
        opacities[i1] = 1.0 - (particleAges.current[i1] / particleMaxAges.current[i1]);
      } else {
        // Make particle invisible if its age is maxed
        opacities[i1] = 0;
      }
    }

    particlesGeometryRef.current.attributes.position.needsUpdate = true;
    particlesGeometryRef.current.attributes.opacity.needsUpdate = true;
  }, [dogMeshRef, dogSpeed, isRunning, emitParticle]);

  return {
    updateParticles,
  };
};
