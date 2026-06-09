import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";

interface ModelBatch {
  modelPath: string;
  instances: Array<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  }>;
  mesh: THREE.InstancedMesh | null;
}

interface BatchTransform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface UpdateBatchOptions extends BatchTransform {
  modelPath: string;
  instanceIndex: number;
}

interface AddToBatchOptions extends BatchTransform {
  modelPath: string;
}

/**
 * Handles the storage and base management of model batches.
 */
const useBatchRegistry = () => {
  const batchesRef = useRef<Map<string, ModelBatch>>(new Map());

  const addToBatch = useCallback((options: AddToBatchOptions) => {
    const { modelPath, position, rotation, scale } = options;
    let batch = batchesRef.current.get(modelPath);

    if (!batch) {
      batch = { modelPath, instances: [], mesh: null };
      batchesRef.current.set(modelPath, batch);
    }

    batch.instances.push({
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone(),
    });

    return batch;
  }, []);

  const getBatches = useCallback(() => Array.from(batchesRef.current.values()), []);

  return { batchesRef, addToBatch, getBatches };
};

/**
 * Handles the creation and updates of InstancedMesh objects.
 */
const useBatchExecution = (
  dummy: THREE.Object3D,
  batchesRef: MutableRefObject<Map<string, ModelBatch>>
) => {
  const createMeshFromBatch = useCallback(
    (batch: ModelBatch, model: THREE.Group) => {
      if (batch.mesh) return batch.mesh;

      const sourceMesh = model.children?.[0];
      if (!(sourceMesh instanceof THREE.Mesh)) {
        logger.error("Model format is not as expected for batching.", model);
        return null;
      }

      const { geometry, material } = sourceMesh;
      const mesh = new THREE.InstancedMesh(geometry.clone(), material, batch.instances.length);

      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = true;

      batch.instances.forEach((instance, index) => {
        dummy.position.copy(instance.position);
        dummy.rotation.copy(instance.rotation);
        dummy.scale.copy(instance.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      batch.mesh = mesh;
      return mesh;
    },
    [dummy]
  );

  const updateBatch = useCallback(
    (options: UpdateBatchOptions) => {
      const { modelPath, instanceIndex, position, rotation, scale } = options;
      const batch = batchesRef.current.get(modelPath);
      if (!batch?.mesh) return;

      dummy.position.copy(position);
      dummy.rotation.copy(rotation);
      dummy.scale.copy(scale);
      dummy.updateMatrix();

      batch.mesh.setMatrixAt(instanceIndex, dummy.matrix);
      batch.mesh.instanceMatrix.needsUpdate = true;
    },
    [dummy, batchesRef]
  );

  return { createMeshFromBatch, updateBatch };
};

export const useModelBatching = () => {
  const { batchesRef, addToBatch, getBatches } = useBatchRegistry();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const { createMeshFromBatch, updateBatch } = useBatchExecution(dummy, batchesRef);

  const removeInstance = useCallback(
    (modelPath: string, instanceIndex: number) => {
      const batch = batchesRef.current.get(modelPath);
      if (!batch?.mesh) return;

      dummy.position.set(10000, 10000, 10000);
      dummy.updateMatrix();

      batch.mesh.setMatrixAt(instanceIndex, dummy.matrix);
      batch.mesh.instanceMatrix.needsUpdate = true;
    },
    [dummy, batchesRef]
  );

  return {
    addToBatch,
    createMeshFromBatch,
    updateBatch,
    removeInstance,
    getBatches,
  };
};
