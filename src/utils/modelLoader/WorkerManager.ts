import { type WorkerTask } from "./types";

export class WorkerManager {
  private static instance: WorkerManager;
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private readonly MAX_WORKERS = 4;
  private isBrowser = typeof window !== "undefined";

  private constructor() {
    if (this.isBrowser) {
      for (let i = 0; i < this.MAX_WORKERS; i++) {
        // Updated to use the correct path for the production worker
        const worker = new Worker(
          new URL("../../workers/modelProcessor.worker.ts", import.meta.url)
        );
        worker.onmessage = this._onWorkerMessage.bind(this);
        this.workers.push(worker);
      }
    }
  }

  public static getInstance(): WorkerManager {
    if (!WorkerManager.instance) {
      WorkerManager.instance = new WorkerManager();
    }
    return WorkerManager.instance;
  }

  private _onWorkerMessage(event: MessageEvent) {
    const { id, type, data } = event.data;
    const task = this.activeTasks.get(id);

    if (task) {
      this.activeTasks.delete(id);
      if (type === "error") {
        task.reject(data);
      } else {
        task.resolve(data);
      }
      this.processQueue();
    }
  }

  private processQueue() {
    while (this.taskQueue.length > 0 && this.activeTasks.size < this.MAX_WORKERS) {
      const task = this.taskQueue.shift();
      if (task) {
        this._executeTaskOnWorker(task);
      }
    }
  }

  private _executeTaskOnWorker(task: WorkerTask) {
    const worker = this.workers[this.activeTasks.size % this.MAX_WORKERS];
    if (worker) {
      this.activeTasks.set(task.id, task);

      const geometryData = (
        task.data as {
          geometry: {
            attributes: Record<string, { array: { buffer: ArrayBuffer } }>;
            index?: { array: { buffer: ArrayBuffer } } | null;
          };
        }
      ).geometry;
      const transferableData: ArrayBuffer[] = Object.values(geometryData.attributes).map(
        attr => attr.array.buffer
      );
      if (geometryData.index) {
        transferableData.push(geometryData.index.array.buffer);
      }

      worker.postMessage(
        {
          type: task.type,
          id: task.id, // Ensure id is passed
          data: task.data,
        },
        transferableData
      );
    } else {
      this.taskQueue.unshift(task);
    }
  }

  public executeTask(type: string, data: unknown): Promise<unknown> {
    if (!this.isBrowser) {
      return Promise.reject(new Error("Workers are not available in a non-browser environment."));
    }
    return new Promise((resolve, reject) => {
      const task: WorkerTask = {
        id: Math.random().toString(36).substring(2, 11),
        type,
        data,
        resolve,
        reject,
      };

      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  getWorkerStatus() {
    return {
      total: this.workers.length,
      active: this.activeTasks.size,
      queued: this.taskQueue.length,
    };
  }

  terminateWorkers(): void {
    if (!this.isBrowser) return;
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.activeTasks.clear();
    this.taskQueue = [];
  }
}

export const workerManager = WorkerManager.getInstance();
