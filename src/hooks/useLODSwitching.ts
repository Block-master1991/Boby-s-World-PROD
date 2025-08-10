import * as THREE from 'three';
import { useCallback, useRef } from 'react';
// A dummy object to manipulate matrices.
const dummy = new THREE.Object3D();

interface LODModelPaths {
  high: string;
  medium: string;
  low: string;
}

interface LODMeshes {
  high: THREE.InstancedMesh | null;
  medium: THREE.InstancedMesh | null;
  low: THREE.InstancedMesh | null;
}

interface LODInstance {
  // Unique identifier for this instance
  id: string; 
  // The model type (e.g., 'tree1')
  modelIdentifier: string; 
  // Current LOD level
  currentLOD: 'high' | 'medium' | 'low';
  // The index of this instance within its current InstancedMesh
  instanceId: number;
  // The transform of the instance
  transform: THREE.Matrix4;
}

export const useLODSwitching = () => {
  // Stores the paths for each model's LODs
  const lodModelPathsRef = useRef<Record<string, LODModelPaths>>({});
  // Stores the actual InstancedMesh objects for each model and LOD
  const lodMeshesRef = useRef<Map<string, LODMeshes>>(new Map());
  // Stores the state of each individual instance
  const instancesRef = useRef<Map<string, LODInstance>>(new Map());

  const initializeLODModels = useCallback((models: Record<string, LODModelPaths>) => {
    lodModelPathsRef.current = models;
  }, []);

  // Function to create and add a new instance to the system
  const addInstance = useCallback((
    instanceId: string,
    modelIdentifier: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3
  ) => {
    // This function would be called to add new objects to the world.
    // It would determine the initial LOD and add it to the correct InstancedMesh.
    // For this refactor, we'll focus on the switching logic.
  }, []);

  const switchLOD = useCallback((instanceKey: string, newLOD: 'high' | 'medium' | 'low') => {
    const instance = instancesRef.current.get(instanceKey);
    if (!instance || instance.currentLOD === newLOD) return;

    const modelMeshes = lodMeshesRef.current.get(instance.modelIdentifier);
    if (!modelMeshes) return;

    const oldMesh = modelMeshes[instance.currentLOD];
    const newMesh = modelMeshes[newLOD];

    if (!oldMesh || !newMesh) {
      console.error(`LOD mesh not available for ${instance.modelIdentifier}`);
      return;
    }

    // "Remove" from old mesh by scaling its matrix to zero
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    oldMesh.setMatrixAt(instance.instanceId, dummy.matrix);
    oldMesh.instanceMatrix.needsUpdate = true;

    // Find an available slot in the new mesh and "add" it
    // This requires a more complex management of free slots in the InstancedMesh.
    // For simplicity, we'll assume we can just set it. A real implementation
    // would need to track instance counts and free indices.
    const newInstanceId = instance.instanceId; // Simplified for now
    newMesh.setMatrixAt(newInstanceId, instance.transform);
    newMesh.instanceMatrix.needsUpdate = true;

    // Update the instance's state
    instance.currentLOD = newLOD;
    instance.instanceId = newInstanceId;

  }, []);

  const updateLODBasedOnDistance = useCallback((
    instanceKey: string,
    distance: number
  ) => {
    const instance = instancesRef.current.get(instanceKey);
    if (!instance) return;

    let newLOD: 'high' | 'medium' | 'low';
    if (distance < 50) newLOD = 'high';
    else if (distance < 100) newLOD = 'medium';
    else newLOD = 'low';

    if (instance.currentLOD !== newLOD) {
      switchLOD(instanceKey, newLOD);
    }
  }, [switchLOD]);

  // This function would be called after loading models to create the InstancedMeshes
  const createLODMeshes = useCallback(async (
    modelIdentifier: string,
    models: { high: THREE.Group, medium: THREE.Group, low: THREE.Group },
    maxCount: number
  ) => {
    const createMesh = (model: THREE.Group): THREE.InstancedMesh | null => {
      if (!model.children.length || !(model.children[0] instanceof THREE.Mesh)) {
        return null;
      }
      const sourceMesh = model.children[0] as THREE.Mesh;
      const mesh = new THREE.InstancedMesh(sourceMesh.geometry.clone(), sourceMesh.material, maxCount);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return mesh;
    };

    const highMesh = createMesh(models.high);
    const mediumMesh = createMesh(models.medium);
    const lowMesh = createMesh(models.low);

    lodMeshesRef.current.set(modelIdentifier, { high: highMesh, medium: mediumMesh, low: lowMesh });

    return { highMesh, mediumMesh, lowMesh };
  }, []);

  return {
    initializeLODModels,
    updateLODBasedOnDistance,
    createLODMeshes,
    addInstance,
    getLODMeshes: (modelIdentifier: string) => lodMeshesRef.current.get(modelIdentifier)
  };
};
