import * as THREE from 'three';
import { useCallback, useRef } from 'react';
import { logger } from '@/utils/logger';
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
  // Frustum for culling objects outside camera view
  const frustumRef = useRef(new THREE.Frustum());
  // Camera projection matrix for frustum calculation
  const cameraProjectionMatrixRef = useRef(new THREE.Matrix4());

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
    const modelMeshes = lodMeshesRef.current.get(modelIdentifier);
    if (!modelMeshes || !modelMeshes.low) {
      logger.error(`LOD meshes for ${modelIdentifier} not initialized.`);
      return;
    }

    // Create the transformation matrix for the new instance
    const transform = new THREE.Matrix4();
    transform.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);

    // For simplicity, we'll add new instances to the 'low' LOD by default.
    // A more robust implementation would calculate distance to camera here.
    const initialLOD = 'low';
    const targetMesh = modelMeshes[initialLOD];

    // A real implementation needs a robust way to find the next free instance index.
    // Here, we'll just assume the count of the mesh is the next available index.
    const newInstanceIndex = targetMesh.count;
    if (newInstanceIndex >= targetMesh.instanceMatrix.array.length / 16) {
      logger.warn(`InstancedMesh for ${modelIdentifier} (${initialLOD}) is full.`);
      return;
    }

    targetMesh.setMatrixAt(newInstanceIndex, transform);
    targetMesh.instanceMatrix.needsUpdate = true;
    targetMesh.count++;

    // Ensure the mesh is visible
    targetMesh.visible = true;
    targetMesh.frustumCulled = false; // Disable automatic culling to ensure visibility

    // Store the instance's state
    const newInstance: LODInstance = {
      id: instanceId,
      modelIdentifier,
      currentLOD: initialLOD,
      instanceId: newInstanceIndex,
      transform,
    };

    instancesRef.current.set(instanceId, newInstance);
    logger.log(`[useLODSwitching] Added instance ${instanceId} to instancesRef. Current count: ${instancesRef.current.size}`);
  }, []);

  const switchLOD = useCallback((instanceKey: string, newLOD: 'high' | 'medium' | 'low') => {
    const instance = instancesRef.current.get(instanceKey);
    if (!instance || instance.currentLOD === newLOD) return;

    logger.log(`[useLODSwitching] Switching LOD for ${instanceKey} from ${instance.currentLOD} to ${newLOD}`);

    const modelMeshes = lodMeshesRef.current.get(instance.modelIdentifier);
    if (!modelMeshes) return;

    const oldMesh = modelMeshes[instance.currentLOD]; // Access by property name
    const newMesh = modelMeshes[newLOD]; // Access by property name

    if (!oldMesh || !newMesh) {
      logger.error(`[useLODSwitching] LOD mesh not available for ${instance.modelIdentifier}`);
      return;
    }

    // "Remove" from old mesh by scaling its matrix to zero
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    oldMesh.setMatrixAt(instance.instanceId, dummy.matrix);
    oldMesh.instanceMatrix.needsUpdate = true;
    logger.gameLoop(`Hid instance ${instanceKey} in old mesh (${instance.currentLOD})`);

    // Find an available slot in the new mesh and "add" it
    // This requires a more complex management of free slots in the InstancedMesh.
    // For simplicity, we'll assume we can just set it. A real implementation
    // would need to track instance counts and free indices.
    const newInstanceId = instance.instanceId; // Simplified for now
    newMesh.setMatrixAt(newInstanceId, instance.transform);
    newMesh.instanceMatrix.needsUpdate = true;
    logger.gameLoop(`Showed instance ${instanceKey} in new mesh (${newLOD})`);

    // Update the instance's state
    instance.currentLOD = newLOD;
    instance.instanceId = newInstanceId;

  }, []);

  const removeInstance = useCallback((instanceId: string) => {
    const instance = instancesRef.current.get(instanceId);
    if (!instance) return;

    logger.log(`Removing instance ${instanceId}`);

    const modelMeshes = lodMeshesRef.current.get(instance.modelIdentifier);
    if (!modelMeshes) return;

    const currentMesh = modelMeshes[instance.currentLOD];
    if (currentMesh) {
      // Set the instance's matrix to a zero scale to effectively hide it
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      currentMesh.setMatrixAt(instance.instanceId, dummy.matrix);
      currentMesh.instanceMatrix.needsUpdate = true;
      logger.log(`Hid instance ${instanceId} in its current mesh (${instance.currentLOD})`);
    }
    instancesRef.current.delete(instanceId);
    logger.log(`Removed instance ${instanceId} from instancesRef. Remaining count: ${instancesRef.current.size}`);
  }, []);

  // Update frustum based on camera position and projection
  const updateFrustum = useCallback((camera: THREE.Camera) => {
    camera.updateMatrixWorld(); // Make sure the camera matrix is updated
    cameraProjectionMatrixRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustumRef.current.setFromProjectionMatrix(cameraProjectionMatrixRef.current);
  }, []);

  // Check if an object is within the camera's view frustum
  const isInFrustum = useCallback((position: THREE.Vector3, radius: number = 1) => {
    return frustumRef.current.intersectsSphere(new THREE.Sphere(position, radius));
  }, []);

  const updateLODBasedOnDistance = useCallback((
    instanceKey: string,
    distance: number,
    camera?: THREE.Camera,
    position?: THREE.Vector3
  ) => {
    const instance = instancesRef.current.get(instanceKey);
    if (!instance) return;

    // Extract position from transform matrix if not provided
    let objectPosition = position;
    if (!objectPosition) {
      objectPosition = new THREE.Vector3();
      objectPosition.setFromMatrixPosition(instance.transform);
    }

    // Check if object is in frustum
    const inFrustum = camera ? isInFrustum(objectPosition) : true;

    // Skip LOD updates if object is not in frustum
    if (!inFrustum) return;

    let newLOD: 'high' | 'medium' | 'low';
    if (distance < 50) newLOD = 'high';
    else if (distance < 100) newLOD = 'medium';
    else newLOD = 'low';

    if (instance.currentLOD !== newLOD) {
      switchLOD(instanceKey, newLOD);
    }
  }, [switchLOD, isInFrustum]);

  // This function would be called after loading models to create the InstancedMeshes
  const createLODMeshes = useCallback(async (
    modelIdentifier: string,
    models: { high: THREE.Group, medium: THREE.Group, low: THREE.Group },
    maxCount: number
  ) => {
    logger.log(`[useLODSwitching] Creating LOD meshes for ${modelIdentifier} with maxCount: ${maxCount}`);
    const createMesh = (model: THREE.Group, lodLevel: string): THREE.InstancedMesh | null => {
      if (!model.children.length || !(model.children[0] instanceof THREE.Mesh)) {
        logger.warn(`Model for ${modelIdentifier} (${lodLevel}) has no mesh child.`);
        return null;
      }
      const sourceMesh = model.children[0] as THREE.Mesh;
      const materialUUID = Array.isArray(sourceMesh.material) ? sourceMesh.material[0]?.uuid : sourceMesh.material?.uuid;
      logger.log(`Creating InstancedMesh for ${modelIdentifier} (${lodLevel}) with geometry UUID: ${sourceMesh.geometry.uuid} and material UUID: ${materialUUID}`);
      const mesh = new THREE.InstancedMesh(sourceMesh.geometry.clone(), sourceMesh.material, maxCount);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.name = `${modelIdentifier}_${lodLevel}_InstancedMesh`;

      // Ensure the mesh is visible and renderable
      mesh.visible = true;
      mesh.frustumCulled = false; // Disable automatic culling to ensure visibility
      mesh.castShadow = true; // Enable shadow casting
      mesh.receiveShadow = true; // Enable shadow receiving

      return mesh;
    };

    const highMesh = createMesh(models.high, 'high');
    const mediumMesh = createMesh(models.medium, 'medium');
    const lowMesh = createMesh(models.low, 'low');

    lodMeshesRef.current.set(modelIdentifier, { high: highMesh, medium: mediumMesh, low: lowMesh });
    logger.log(`[useLODSwitching] Stored LOD meshes for ${modelIdentifier}:`, lodMeshesRef.current.get(modelIdentifier));

    return { highMesh, mediumMesh, lowMesh };
  }, []);

  // Update visibility of all instances based on frustum culling
  const updateVisibilityBasedOnFrustum = useCallback((camera: THREE.Camera) => {
    // Update frustum first
    updateFrustum(camera);

    // Create a dummy object to manipulate matrices
    const dummy = new THREE.Object3D();
    dummy.scale.set(0, 0, 0); // Scale of zero makes objects invisible
    dummy.updateMatrix();

    // Track visibility changes to avoid unnecessary updates
    const visibilityChanges: Map<string, boolean> = new Map();

    // Check all instances
    instancesRef.current.forEach((instance, instanceId) => {
      // Extract position from transform matrix
      const position = new THREE.Vector3();
      position.setFromMatrixPosition(instance.transform);

      // Check if instance is in frustum
      const inFrustum = isInFrustum(position);

      // Get the current mesh for this instance
      const modelMeshes = lodMeshesRef.current.get(instance.modelIdentifier);
      if (!modelMeshes) return;

      const currentMesh = modelMeshes[instance.currentLOD];
      if (!currentMesh) return;

      // Store visibility change if needed
      if (visibilityChanges.get(instanceId) !== inFrustum) {
        visibilityChanges.set(instanceId, inFrustum);

        if (inFrustum) {
          // Make object visible - restore its transform
          currentMesh.setMatrixAt(instance.instanceId, instance.transform);
        } else {
          // Make object invisible - zero scale
          currentMesh.setMatrixAt(instance.instanceId, dummy.matrix);
        }
      }
    });

    // Update all meshes that had visibility changes
    lodMeshesRef.current.forEach(modelMeshes => {
      Object.values(modelMeshes).forEach(mesh => {
        if (mesh) {
          mesh.instanceMatrix.needsUpdate = true;
        }
      });
    });

    return visibilityChanges.size; // Return number of visibility changes
  }, [updateFrustum, isInFrustum]);

  return {
    initializeLODModels,
    updateLODBasedOnDistance,
    createLODMeshes,
    addInstance,
    removeInstance, // Expose removeInstance
    getLODMeshes: (modelIdentifier: string) => lodMeshesRef.current.get(modelIdentifier),
    updateFrustum,
    isInFrustum,
    updateVisibilityBasedOnFrustum
  };
};
