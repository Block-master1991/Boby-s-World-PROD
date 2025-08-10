import * as THREE from 'three';
import { useCallback, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ModelBatch {
  modelPath: string;
  instances: Array<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  }>;
  mesh: THREE.InstancedMesh | null;
}

export const useModelBatching = () => {
  const batchesRef = useRef<Map<string, ModelBatch>>(new Map());
  const dummy = new THREE.Object3D();

  const addToBatch = useCallback((
    modelPath: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3
  ) => {
    let batch = batchesRef.current.get(modelPath);
    
    if (!batch) {
      batch = {
        modelPath,
        instances: [],
        mesh: null
      };
      batchesRef.current.set(modelPath, batch);
    }

    batch.instances.push({
      position: position.clone(),
      rotation: rotation.clone(),
      scale: scale.clone()
    });

    return batch;
  }, []);

  const createMeshFromBatch = useCallback(async (batch: ModelBatch, model: THREE.Group) => {
    if (batch.mesh) return batch.mesh;

    // Ensure the model has children and the first child is a Mesh
    if (!model.children.length || !(model.children[0] instanceof THREE.Mesh)) {
      console.error("Model format is not as expected for batching.", model);
      return null;
    }

    const sourceMesh = model.children[0] as THREE.Mesh;
    const geometry = sourceMesh.geometry;
    const material = sourceMesh.material;

    const mesh = new THREE.InstancedMesh(
      geometry.clone(), // Clone geometry to avoid issues with multiple batches using the same source
      material,
      batch.instances.length
    );

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;

    // تطبيق جميع الإعدادات للنماذج في الدفعة
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
  }, []);

  const updateBatch = useCallback((
    modelPath: string,
    instanceIndex: number,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    scale: THREE.Vector3
  ) => {
    const batch = batchesRef.current.get(modelPath);
    if (!batch || !batch.mesh) return;

    dummy.position.copy(position);
    dummy.rotation.copy(rotation);
    dummy.scale.copy(scale);
    dummy.updateMatrix();

    batch.mesh.setMatrixAt(instanceIndex, dummy.matrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const removeInstance = useCallback((
    modelPath: string,
    instanceIndex: number
  ) => {
    const batch = batchesRef.current.get(modelPath);
    if (!batch || !batch.mesh) return;

    // نقل النموذج بعيداً بدلاً من إزالته
    dummy.position.set(10000, 10000, 10000);
    dummy.updateMatrix();

    batch.mesh.setMatrixAt(instanceIndex, dummy.matrix);
    batch.mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const getBatches = useCallback(() => {
    return Array.from(batchesRef.current.values());
  }, []);

  return {
    addToBatch,
    createMeshFromBatch,
    updateBatch,
    removeInstance,
    getBatches
  };
};
