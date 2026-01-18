import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import * as THREE from 'three';

const dummy = new THREE.Object3D();

interface LODModelPaths { high: string; medium: string; low: string; }
interface LODMeshes { high: THREE.InstancedMesh | null; medium: THREE.InstancedMesh | null; low: THREE.InstancedMesh | null; }
interface LODInstance { id: string; modelIdentifier: string; currentLOD: 'high' | 'medium' | 'low'; instanceId: number; transform: THREE.Matrix4; }
export interface AddInstanceOptions { instanceId: string; modelIdentifier: string; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3; }

/**
 * Internal hook to manage all refs for LOD switching.
 */
const useLODRefs = () => ({
  lodModelPathsRef: useRef<Record<string, LODModelPaths>>({}),
  lodMeshesRef: useRef<Map<string, LODMeshes>>(new Map()),
  instancesRef: useRef<Map<string, LODInstance>>(new Map()),
  frustumRef: useRef(new THREE.Frustum()),
  cameraProjectionMatrixRef: useRef(new THREE.Matrix4())
});

/**
 * Internal hook for instance creation.
 */
const useInstanceCreation = (
  lodMeshesRef: MutableRefObject<Map<string, LODMeshes>>,
  instancesRef: MutableRefObject<Map<string, LODInstance>>
) => {
  return {
    addInstance: useCallback((options: AddInstanceOptions) => {
      const { instanceId, modelIdentifier, position, rotation, scale } = options;
      const modelMeshes = lodMeshesRef.current.get(modelIdentifier);
      if (!modelMeshes?.low) return;

      const transform = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
      const targetMesh = modelMeshes.low;
      const newIndex = targetMesh.count;

      if (newIndex >= targetMesh.instanceMatrix.array.length / 16) return;

      targetMesh.setMatrixAt(newIndex, transform);
      targetMesh.instanceMatrix.needsUpdate = true;
      targetMesh.count++;
      instancesRef.current.set(instanceId, { id: instanceId, modelIdentifier, currentLOD: 'low', instanceId: newIndex, transform });
    }, [lodMeshesRef, instancesRef])
  };
};

/**
 * Internal hook for instance mutation (switch, remove).
 */
const useInstanceMutation = (
  lodMeshesRef: MutableRefObject<Map<string, LODMeshes>>,
  instancesRef: MutableRefObject<Map<string, LODInstance>>
) => {
  const switchLOD = useCallback((instanceKey: string, newLOD: 'high' | 'medium' | 'low') => {
    const instance = instancesRef.current.get(instanceKey);
    const modelMeshes = lodMeshesRef.current.get(instance?.modelIdentifier || '');
    if (!instance || instance.currentLOD === newLOD || !modelMeshes) return;

    const oldMesh = modelMeshes[instance.currentLOD];
    const newMesh = modelMeshes[newLOD];
    if (!oldMesh || !newMesh) return;

    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    oldMesh.setMatrixAt(instance.instanceId, dummy.matrix);
    oldMesh.instanceMatrix.needsUpdate = true;
    newMesh.setMatrixAt(instance.instanceId, instance.transform);
    newMesh.instanceMatrix.needsUpdate = true;
    instance.currentLOD = newLOD;
  }, [lodMeshesRef, instancesRef]);

  const removeInstance = useCallback((instanceId: string) => {
    const instance = instancesRef.current.get(instanceId);
    if (!instance) return;

    const currentMesh = lodMeshesRef.current.get(instance.modelIdentifier)?.[instance.currentLOD];
    if (currentMesh) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      currentMesh.setMatrixAt(instance.instanceId, dummy.matrix);
      currentMesh.instanceMatrix.needsUpdate = true;
    }
    instancesRef.current.delete(instanceId);
  }, [lodMeshesRef, instancesRef]);

  return { switchLOD, removeInstance };
};

/**
 * Internal hook for frustum culling and visibility.
 */
const useVisibilityCulling = (
  lodMeshesRef: MutableRefObject<Map<string, LODMeshes>>,
  instancesRef: MutableRefObject<Map<string, LODInstance>>,
  frustumRef: MutableRefObject<THREE.Frustum>,
  cameraProjectionMatrixRef: MutableRefObject<THREE.Matrix4>
) => {
  const updateFrustum = useCallback((camera: THREE.Camera) => {
    camera.updateMatrixWorld();
    cameraProjectionMatrixRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumRef.current.setFromProjectionMatrix(cameraProjectionMatrixRef.current);
  }, [cameraProjectionMatrixRef, frustumRef]);

  const updateVisibilityBasedOnFrustum = useCallback((camera: THREE.Camera) => {
    updateFrustum(camera);
    let changes = 0;
    const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    instancesRef.current.forEach((instance) => {
      const pos = new THREE.Vector3().setFromMatrixPosition(instance.transform);
      const inView = frustumRef.current.intersectsSphere(new THREE.Sphere(pos, 1));
      const mesh = lodMeshesRef.current.get(instance.modelIdentifier)?.[instance.currentLOD];
      if (mesh) {
        mesh.setMatrixAt(instance.instanceId, inView ? instance.transform : hideMatrix);
        changes++;
      }
    });

    lodMeshesRef.current.forEach(m => Object.values(m).forEach(mesh => mesh && (mesh.instanceMatrix.needsUpdate = true)));
    return changes;
  }, [updateFrustum, instancesRef, lodMeshesRef, frustumRef]);

  return { updateFrustum, updateVisibilityBasedOnFrustum };
};

/**
 * Main hook that orchestrates LOD switching logic.
 */
export const useLODSwitching = () => {
  const { lodModelPathsRef, lodMeshesRef, instancesRef, frustumRef, cameraProjectionMatrixRef } = useLODRefs();
  const { addInstance } = useInstanceCreation(lodMeshesRef, instancesRef);
  const { switchLOD, removeInstance } = useInstanceMutation(lodMeshesRef, instancesRef);
  const { updateFrustum, updateVisibilityBasedOnFrustum } = useVisibilityCulling(lodMeshesRef, instancesRef, frustumRef, cameraProjectionMatrixRef);

  const createLODMeshes = useCallback((modelIdentifier: string, models: Record<'high' | 'medium' | 'low', THREE.Group>, maxCount: number) => {
    const createMesh = (model: THREE.Group, lod: string) => {
      const source = model.children[0] as THREE.Mesh;
      if (!source?.geometry) return null;
      const m = new THREE.InstancedMesh(source.geometry.clone(), source.material, maxCount);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.name = `${modelIdentifier}_${lod}_InstancedMesh`;
      m.visible = true;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    const meshes = { high: createMesh(models.high, 'high'), medium: createMesh(models.medium, 'medium'), low: createMesh(models.low, 'low') };
    lodMeshesRef.current.set(modelIdentifier, meshes);
    return meshes;
  }, [lodMeshesRef]);

  const updateLODBasedOnDistance = useCallback((instanceKey: string, distance: number, camera?: THREE.Camera) => {
    const instance = instancesRef.current.get(instanceKey);
    if (!instance) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(instance.transform);
    if (camera && !frustumRef.current.intersectsSphere(new THREE.Sphere(pos, 1))) return;

    let newLOD: 'high' | 'medium' | 'low' = 'low';
    if (distance < 50) newLOD = 'high';
    else if (distance < 100) newLOD = 'medium';

    if (instance.currentLOD !== newLOD) switchLOD(instanceKey, newLOD);
  }, [switchLOD, instancesRef, frustumRef]);

  return {
    initializeLODModels: useCallback((models: Record<string, LODModelPaths>) => { lodModelPathsRef.current = models; }, [lodModelPathsRef]),
    updateLODBasedOnDistance,
    createLODMeshes,
    addInstance,
    removeInstance,
    getLODMeshes: (id: string) => lodMeshesRef.current.get(id),
    updateFrustum,
    isInFrustum: (pos: THREE.Vector3, r = 1) => frustumRef.current.intersectsSphere(new THREE.Sphere(pos, r)),
    updateVisibilityBasedOnFrustum
  };
};
