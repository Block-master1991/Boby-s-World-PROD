import type * as THREE from "three";
import { retryManager } from "./RetryManager";
import { LoadPriority, type LoadOptions, type PriorityRequest } from "./types";

export class PriorityManager {
  private static instance: PriorityManager;
  private loadQueues: Map<LoadPriority, PriorityRequest[]> = new Map();
  private activeLoads: Map<string, AbortController> = new Map();
  private readonly MAX_CONCURRENT_LOADS = 3;
  private processingQueue = false;

  private constructor() {
    const priorities = Object.values(LoadPriority).filter(
      v => typeof v === "number"
    ) as LoadPriority[];
    for (const priority of priorities) {
      this.loadQueues.set(priority, []);
    }
  }

  public static getInstance(): PriorityManager {
    if (!PriorityManager.instance) {
      PriorityManager.instance = new PriorityManager();
    }
    return PriorityManager.instance;
  }

  public addToQueue(
    path: string,
    priority: LoadPriority,
    compress: boolean,
    instanceId?: string
  ): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      const request: PriorityRequest = { path, priority, resolve, reject, compress, instanceId };
      this.loadQueues.get(priority)?.push(request);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.activeLoads.size < this.MAX_CONCURRENT_LOADS) {
      const request = this.getNextRequest();
      if (!request) break;

      const abortController = new AbortController();
      this.activeLoads.set(request.path, abortController);

      const options: LoadOptions = {
        path: request.path,
        compress: request.compress,
        instanceId: request.instanceId,
        priority: request.priority,
        abortController,
      };

      try {
        // eslint-disable-next-line no-await-in-loop
        const model = await retryManager.loadWithRetry(options);
        request.resolve(model);
      } catch (error) {
        request.reject(error);
      } finally {
        this.activeLoads.delete(request.path);
      }
    }

    this.processingQueue = false;

    const hasMore = Array.from(this.loadQueues.values()).some(q => q.length > 0);
    if (hasMore) {
      this.processQueue();
    }
  }

  private getNextRequest(): PriorityRequest | null {
    const priorities = Object.values(LoadPriority)
      .filter(v => typeof v === "number")
      .sort((a, b) => (a as number) - (b as number)) as LoadPriority[];

    for (const priority of priorities) {
      const queue = this.loadQueues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  public getQueueStatus() {
    let total = 0;
    this.loadQueues.forEach(queue => {
      total += queue.length;
    });
    return {
      active: this.activeLoads.size,
      queued: total,
    };
  }
}

export const priorityManager = PriorityManager.getInstance();
