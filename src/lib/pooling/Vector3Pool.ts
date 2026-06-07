import { THREE } from "@/lib/three-chunk";
import { ObjectPool } from "./ObjectPool";
import type { PoolConfig } from "./types";

// Vector3 Pool for temporary calculations with stack-based recycling
export class Vector3Pool extends ObjectPool<THREE.Vector3> {
  /** Stack to track temp vectors for automatic scope-based cleanup */
  private tempStack: THREE.Vector3[] = [];
  private readonly MAX_TEMP_STACK_DEPTH = 64;

  constructor(config?: Partial<PoolConfig>) {
    super(config);
  }

  protected create(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  protected reset(obj: THREE.Vector3): void {
    obj.set(0, 0, 0);
  }

  protected dispose(): void {
    // Vector3 doesn't need disposal
  }

  protected isValid(): boolean {
    return true;
  }

  // --- Scoped temp vector management ---

  /**
   * Get a temporary vector and push it onto the temp stack.
   * Use releaseTempScope() to release all vectors acquired since the last beginTempScope().
   */
  beginTempScope(): void {
    // Mark the current stack depth with a sentinel
    this.tempStack.push(null as unknown as THREE.Vector3);
  }

  /**
   * Release all temp vectors acquired since the last beginTempScope() call.
   * This prevents leaks by ensuring every scope is cleanly released.
   */
  releaseTempScope(): void {
    while (this.tempStack.length > 0) {
      const vec = this.tempStack.pop()!;
      // Stop at the sentinel (null marker)
      if (vec === null) break;
      this.release(vec);
    }
  }

  // Utility methods for vector operations
  getTempVector(x: number = 0, y: number = 0, z: number = 0): THREE.Vector3 {
    const vec = this.get();
    vec.set(x, y, z);

    // Track in temp stack for scoped cleanup
    if (this.tempStack.length < this.MAX_TEMP_STACK_DEPTH) {
      this.tempStack.push(vec);
    }

    return vec;
  }

  releaseTempVector(vec: THREE.Vector3): void {
    // Remove from temp stack if present
    const idx = this.tempStack.indexOf(vec);
    if (idx !== -1) {
      // Swap with last element for O(1) removal
      const last = this.tempStack.length - 1;
      if (idx !== last) {
        this.tempStack[idx] = this.tempStack[last]!;
      }
      this.tempStack.pop();
    }
    this.release(vec);
  }

  /**
   * Execute a function with a temporary vector that is automatically released.
   * Prevents forgetting to release temp vectors.
   */
  withTempVector<R>(x: number, y: number, z: number, fn: (vec: THREE.Vector3) => R): R {
    const vec = this.get();
    vec.set(x, y, z);
    try {
      return fn(vec);
    } finally {
      this.release(vec);
    }
  }
}
