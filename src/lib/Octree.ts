import * as THREE from 'three';

interface OctreeObject<T> {
    id: string; // Unique identifier for the object
    bounds: THREE.Box3;
    data: T; // Any additional data associated with the object
}

class OctreeNode<T> {
    bounds: THREE.Box3;
    children: (OctreeNode<T> | null)[];
    objects: OctreeObject<T>[];
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

class Octree<T> {
    root: OctreeNode<T>;
    maxDepth: number;
    maxObjectsPerNode: number;

    constructor(worldBounds: THREE.Box3, maxDepth: number = 8, maxObjectsPerNode: number = 10) {
        this.root = new OctreeNode<T>(worldBounds, 0);
        this.maxDepth = maxDepth;
        this.maxObjectsPerNode = maxObjectsPerNode;
    }

    insert(object: OctreeObject<T>): boolean {
        return this.insertIntoNode(this.root, object);
    }

    private insertIntoNode(node: OctreeNode<T>, object: OctreeObject<T>): boolean {
        if (!node.bounds.intersectsBox(object.bounds)) {
            return false; // Object is outside this node's bounds
        }

        if (node.isLeaf() && node.objects.length < this.maxObjectsPerNode || node.depth === this.maxDepth) {
            node.objects.push(object);
            return true;
        }

        if (node.isLeaf()) {
            this.subdivide(node);
        }

        let insertedIntoChild = false;
        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                if (this.insertIntoNode(node.children[i]!, object)) {
                    insertedIntoChild = true;
                }
            }
        }

        if (!insertedIntoChild) {
            node.objects.push(object);
        }

        return true;
    }

    private subdivide(node: OctreeNode<T>): void {
        const {min} = node.bounds;
        const {max} = node.bounds;
        const halfSize = new THREE.Vector3().subVectors(max, min).multiplyScalar(0.5);

        const subBounds = [
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z), new THREE.Vector3(max.x, min.y + halfSize.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z), new THREE.Vector3(min.x + halfSize.x, max.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z), new THREE.Vector3(max.x, max.y, min.z + halfSize.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y, min.z + halfSize.z), new THREE.Vector3(max.x, min.y + halfSize.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x, min.y + halfSize.y, min.z + halfSize.z), new THREE.Vector3(min.x + halfSize.x, max.y, max.z)),
            new THREE.Box3(new THREE.Vector3(min.x + halfSize.x, min.y + halfSize.y, min.z + halfSize.z), new THREE.Vector3(max.x, max.y, max.z))
        ];

        for (let i = 0; i < 8; i++) {
            node.children[i] = new OctreeNode<T>(subBounds[i]!, node.depth + 1);
        }

        const objectsToRedistribute = node.objects;
        node.objects = [];
        for (const obj of objectsToRedistribute) {
            this.insertIntoNode(node, obj);
        }
    }

    query(boundingBox: THREE.Box3): OctreeObject<T>[] {
        const results: OctreeObject<T>[] = [];
        this.queryNode(this.root, boundingBox, results);
        return results;
    }

    private queryNode(node: OctreeNode<T>, boundingBox: THREE.Box3, results: OctreeObject<T>[]): void {
        if (!node.bounds.intersectsBox(boundingBox)) {
            return;
        }

        for (const obj of node.objects) {
            if (obj.bounds.intersectsBox(boundingBox)) {
                results.push(obj);
            }
        }

        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                this.queryNode(node.children[i]!, boundingBox, results);
            }
        }
    }

    updateObject(object: OctreeObject<T>, newBounds: THREE.Box3): boolean {
        if (!this.remove(object)) {
            return false;
        }
        const updatedObject = { ...object, bounds: newBounds };
        return this.insert(updatedObject);
    }

    remove(object: OctreeObject<T>): boolean {
        return this.removeFromNode(this.root, object);
    }

    private removeFromNode(node: OctreeNode<T>, object: OctreeObject<T>): boolean {
        if (!node.bounds.intersectsBox(object.bounds)) {
            return false;
        }

        const index = node.objects.findIndex(obj => obj.id === object.id);
        if (index !== -1) {
            node.objects.splice(index, 1);
            return true;
        }

        for (let i = 0; i < 8; i++) {
            if (node.children[i]) {
                if (this.removeFromNode(node.children[i]!, object)) {
                    return true;
                }
            }
        }
        return false;
    }

    clear(): void {
        this.root = new OctreeNode<T>(this.root.bounds, 0);
    }

    raycast(ray: THREE.Ray): OctreeObject<T>[] {
        const results: OctreeObject<T>[] = [];
        this.raycastNode(this.root, ray, results);
        return results;
    }

    private raycastNode(node: OctreeNode<T>, ray: THREE.Ray, results: OctreeObject<T>[]) {
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

    frustumCulling(frustum: THREE.Frustum): OctreeObject<T>[] {
        const results: OctreeObject<T>[] = [];
        this.frustumCullingNode(this.root, frustum, results);
        return results;
    }

    private frustumCullingNode(node: OctreeNode<T>, frustum: THREE.Frustum, results: OctreeObject<T>[]) {
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

    getGroundHeightAt(x: number, z: number): number {
        const rayOrigin = new THREE.Vector3(x, this.root.bounds.max.y, z);
        const rayEnd = new THREE.Vector3(x, this.root.bounds.min.y, z);
        const rayBox = new THREE.Box3().setFromPoints([rayOrigin, rayEnd]);

        const intersectingObjects = this.query(rayBox);
        let highestY = 0; // Default to ground plane height

        for (const obj of intersectingObjects) {
            if (obj.id === 'ground' || obj.id.startsWith('obstacle_')) {
                highestY = Math.max(highestY, obj.bounds.max.y);
            }
        }
        return highestY;
    }

    addThreeMesh(mesh: THREE.Object3D, id?: string): void {
        const box = new THREE.Box3().setFromObject(mesh);
        const objectId = id || mesh.uuid;

        const octreeObject: OctreeObject<T> = {
            id: objectId,
            bounds: box,
            data: mesh as T,
        };
        this.insert(octreeObject);
    }
}

export { Octree };
export type { OctreeObject };

