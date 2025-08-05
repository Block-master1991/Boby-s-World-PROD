import * as THREE from 'three';

interface OctreeObject {
    id: string; // Unique identifier for the object
    bounds: THREE.Box3;
    data: any; // Any additional data associated with the object
}

class OctreeNode {
    bounds: THREE.Box3;
    children: (OctreeNode | null)[];
    objects: OctreeObject[];
    depth: number;

    constructor(bounds: THREE.Box3, depth: number) {
        this.bounds = bounds;
        this.children = new Array(8).fill(null);
        this.objects = [];
        this.depth = depth;
    }

    isLeaf(): boolean {
        return this.children.every(child => child === null);
    }
}

class Octree {
    root: OctreeNode;
    maxDepth: number;
    maxObjectsPerNode: number;

    constructor(worldBounds: THREE.Box3, maxDepth: number = 8, maxObjectsPerNode: number = 10) {
        this.root = new OctreeNode(worldBounds, 0);
        this.maxDepth = maxDepth;
        this.maxObjectsPerNode = maxObjectsPerNode;
    }

    insert(object: OctreeObject): boolean {
        return this.insertIntoNode(this.root, object);
    }

    private insertIntoNode(node: OctreeNode, object: OctreeObject): boolean {
        if (!node.bounds.intersectsBox(object.bounds)) {
            return false; // Object is outside this node's bounds
        }

        if (node.isLeaf() && node.objects.length < this.maxObjectsPerNode || node.depth === this.maxDepth) {
            node.objects.push(object);
            return true;
        } else {
            if (node.isLeaf()) {
                this.subdivide(node);
            }
            let inserted = false;
            // Try to insert into children
            for (let i = 0; i < 8; i++) {
                if (node.children[i]) {
                    inserted = this.insertIntoNode(node.children[i]!, object) || inserted;
                }
            }
            if (!inserted) {
            node.objects.push(object);
            return true;
        }
        return inserted;
            // If object spans multiple children or doesn't fit neatly, keep it in the parent
            // This simplified version just pushes to parent if it can't subdivide further or if it's a leaf
            // A more robust implementation would check intersection with children and push to relevant ones.
            // For now, if it's not a leaf and it intersects, it's handled by children.
            // If it's a leaf and full, it subdivides and then tries children.
            // If it still doesn't fit any child perfectly, it stays in the parent.
            // For simplicity, we'll just push to the current node if it's not a leaf and the object intersects.
            // A better approach for objects spanning multiple nodes is to store them in the highest node they fit entirely within.
            // For now, let's refine the subdivision and insertion logic.
            let insertedIntoChild = false;
            for (let i = 0; i < 8; i++) {
                if (node.children[i] && node.children[i]!.bounds.containsBox(object.bounds)) {
                    this.insertIntoNode(node.children[i]!, object);
                    insertedIntoChild = true;
                    break; // Object fits entirely in one child
                }
            }
            if (!insertedIntoChild) {
                node.objects.push(object); // Object spans multiple children or doesn't fit entirely in one
            }
        }
    }

    private subdivide(node: OctreeNode): void {
        const min = node.bounds.min;
        const max = node.bounds.max;
        const halfSize = new THREE.Vector3().subVectors(max, min).multiplyScalar(0.5);

        // Define the 8 sub-regions
        const subBounds = [
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z)), // 0: ---
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z), new THREE.Vector3(max.x, min.y + halfSize.y, min.z + halfSize.z)), // 1: +--
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z), new THREE.Vector3(min.x + halfSize.x, max.y, min.z + halfSize.z)), // 2: -+-
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, max.z)), // 3: --+
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z), new THREE.Vector3(max.x, max.y, min.z + halfSize.z)), // 4: ++-
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z + halfSize.z), new THREE.Vector3(max.x, min.y + halfSize.y, max.z)), // 5: +-+
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, max.y, max.z)), // 6: -++
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z), new THREE.Vector3(max.x, max.y, max.z))  // 7: +++
        ];

        for (let i = 0; i < 8; i++) {
            node.children[i] = new OctreeNode(subBounds[i], node.depth + 1);
        }

        // Redistribute objects from parent to children
        const objectsToRedistribute = [...node.objects];
        node.objects = []; // Clear parent's objects
        for (const obj of objectsToRedistribute) {
            this.insertIntoNode(node, obj); // Re-insert into the subdivided node, which will push to children
        }
    }

    query(boundingBox: THREE.Box3): OctreeObject[] {
        const results: OctreeObject[] = [];
        this.queryNode(this.root, boundingBox, results);
        return results;
    }

    private queryNode(node: OctreeNode, boundingBox: THREE.Box3, results: OctreeObject[]): void {
        if (!node.bounds.intersectsBox(boundingBox)) {
            return;
        }

        // Add objects in the current node that intersect the query box
        for (const obj of node.objects) {
            if (obj.bounds.intersectsBox(boundingBox)) {
                results.push(obj);
            }
        }

        // Recurse into children
        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                this.queryNode(node.children[i]!, boundingBox, results);
            }
        }
    }
    // دالة لتحريك كائن في الـ Octree
  updateObject(object: OctreeObject, newBounds: THREE.Box3): boolean {
    if (!this.remove(object)) {
        return false;
    }
    
    const updatedObject = {
        ...object,
        bounds: newBounds
    };
    
    return this.insert(updatedObject);
}
    remove(object: OctreeObject): boolean {
        return this.removeFromNode(this.root, object);
    }

    private removeFromNode(node: OctreeNode, object: OctreeObject): boolean {
        // Check if the object's bounds intersect with the node's bounds
        if (!node.bounds.intersectsBox(object.bounds)) {
            return false; // Object is not in this branch
        }

        // Try to remove from current node's objects
        const initialLength = node.objects.length;
        node.objects = node.objects.filter(obj => obj.id !== object.id);
        if (node.objects.length < initialLength) {
            return true; // Object found and removed from this node
        }
        // Remove from current node
    const index = node.objects.findIndex(obj => obj.id === object.id);
    if (index !== -1) {
      node.objects.splice(index, 1);
      return true;
    }
        // If not found in current node, recurse into children
        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                if (this.removeFromNode(node.children[i]!, object)) {
                    // Optional: If a child node becomes empty, consider pruning it
                    // For simplicity, we'll leave empty nodes for now.
                    return true;
                }
            }
        }
        return false; // Object not found in this node or its children
    }
clear(): void {
    this.root = new OctreeNode(this.root.bounds, 0);
  }

  raycast(ray: THREE.Ray): OctreeObject[] {
    const results: OctreeObject[] = [];
    this.raycastNode(this.root, ray, results);
    return results;
}

private raycastNode(node: OctreeNode, ray: THREE.Ray, results: OctreeObject[]) {
    if (!ray.intersectsBox(node.bounds)) return;

    for (const obj of node.objects) {
        if (ray.intersectsBox(obj.bounds)) {
            results.push(obj);
        }
    }

    for (let i = 0; i < 8; i++) {
        if (node.children[i]) {
            this.raycastNode(node.children[i]!, ray, results);
        }
    }
}


frustumCulling(frustum: THREE.Frustum): OctreeObject[] {
    const results: OctreeObject[] = [];
    this.frustumCullingNode(this.root, frustum, results);
    return results;
}

    private frustumCullingNode(node: OctreeNode, frustum: THREE.Frustum, results: OctreeObject[]) {
        if (!frustum.intersectsBox(node.bounds)) return;

        for (const obj of node.objects) {
            if (frustum.intersectsBox(obj.bounds)) {
                results.push(obj);
            }
        }

        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                this.frustumCullingNode(node.children[i]!, frustum, results);
            }
        }
    }

    // Method to find the highest Y position for a given X, Z coordinate
    // This is a simplified raycast-like approach for a flat ground plane or simple obstacles
    getGroundHeightAt(x: number, z: number): number {
        // Create a small bounding box (like a ray) extending downwards from a high point
        const rayOrigin = new THREE.Vector3(x, this.root.bounds.max.y, z);
        const rayEnd = new THREE.Vector3(x, this.root.bounds.min.y, z);
        const rayBox = new THREE.Box3().setFromPoints([rayOrigin, rayEnd]);

        const intersectingObjects = this.query(rayBox);
        let highestY = this.root.bounds.min.y; // Start from the lowest possible ground

        for (const obj of intersectingObjects) {
            // Assuming 'ground' objects are the ones we care about for height
            // Or any object that the dog can stand on
            if (obj.id === 'ground' || obj.id.startsWith('obstacle_')) { // Extend to other relevant objects
                // Find the highest point of the object's bounds that is below or at the ray's origin
                highestY = Math.max(highestY, obj.bounds.max.y);
            }
        }
        return highestY;
    }

    // New method to add a Three.js Object3D to the Octree
    addThreeMesh(mesh: THREE.Object3D, id?: string): void {
        const box = new THREE.Box3().setFromObject(mesh);
        const objectId = id || mesh.uuid; // Use provided ID or mesh's UUID

        const octreeObject: OctreeObject = {
            id: objectId,
            bounds: box,
            data: mesh, // Store the mesh itself or relevant data
        };
        this.insert(octreeObject);
    }
}

export { Octree };
export type { OctreeObject };
