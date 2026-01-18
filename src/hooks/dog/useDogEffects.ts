import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { NORMAL_EMISSIVE_COLOR, SHIELD_EMISSIVE_COLOR } from './constants';

export const useDogEffects = (
    dogModelRef: MutableRefObject<THREE.Group | null>,
    isShieldActiveRef: MutableRefObject<boolean>,
    isPausedRef: MutableRefObject<boolean>
) => {
    useEffect(() => {
        if (!dogModelRef.current) return;

        const updateEmissive = () => {
            const dog = dogModelRef.current;
            if (!dog) return;
            const targetHex = (!isPausedRef.current && isShieldActiveRef.current) 
                ? SHIELD_EMISSIVE_COLOR 
                : NORMAL_EMISSIVE_COLOR;

            dog.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    materials.forEach((m: THREE.Material) => {
                        if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                            (m as THREE.MeshStandardMaterial).emissive.setHex(targetHex);
                        }
                    });
                }
            });
        };

        updateEmissive();
        const intervalId = setInterval(updateEmissive, 100);
        return () => clearInterval(intervalId);
    }, [dogModelRef, isShieldActiveRef, isPausedRef]);
};
