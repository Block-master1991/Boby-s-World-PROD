import type * as THREE from "three";
import { logger } from "../logger";
import { memoryManager } from "./MemoryManager";

export class ModelGrouper {
  private static instance: ModelGrouper;
  private modelGroups: Map<string, { model: THREE.Group; instances: Map<string, THREE.Group> }> =
    new Map();

  private constructor() {}

  public static getInstance(): ModelGrouper {
    if (!ModelGrouper.instance) {
      ModelGrouper.instance = new ModelGrouper();
    }
    return ModelGrouper.instance;
  }

  public createInstance(path: string, instanceId: string): THREE.Group | null {
    let group = this.modelGroups.get(path);

    if (!group) {
      const modelFromCache = memoryManager.getModel(path);
      if (!modelFromCache) {
        logger.warn(`[ModelGrouper] Base model not found in cache for path: ${path}`);
        return null;
      }
      group = { model: modelFromCache, instances: new Map() };
      this.modelGroups.set(path, group);
    }

    const instance = group.model.clone();
    group.instances.set(instanceId, instance);

    return instance;
  }

  public removeInstance(path: string, instanceId: string): void {
    const group = this.modelGroups.get(path);
    if (group) {
      group.instances.delete(instanceId);
      if (group.instances.size === 0) {
        this.modelGroups.delete(path);
      }
    }
  }

  public cleanupOldGroups(): void {
    // Basic cleanup logic: remove groups that haven't been used in a while
    // or are explicitly marked for deletion.
  }
}

export const modelGrouper = ModelGrouper.getInstance();
