import type { Euler, Vector2, Vector3 } from 'three';

export interface BranchGeometryData {
  verts: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  windFactor: number[];
}

export interface LeafGeometryData {
  verts: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
}

export interface SectionData {
  origin: Vector3;
  orientation: Euler;
  radius: number;
}

export interface VertexData {
    vertex: Vector3;
    normal: Vector3;
    uv: Vector2;
}
