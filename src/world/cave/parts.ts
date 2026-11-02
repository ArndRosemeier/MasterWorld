/**
 * The loose parts of a formed cave as meshes (D63, K3; pure): formations, stones and crystals are built here as plain
 * arrays (position, normal, tint, material per vertex) in the cave's frame, in the worker, and the renderer draws
 * them with the formed cave kinds (src/render/materials/formedCave.ts).
 */

/** A triangle's material in a formed cave's wall mesh when it is ore (WildMat has Rock 15 and Grass 16). */
export const ORE_MAT = 17;
/** A part's material: 0 is stone (a formation, a loose rock), 1 a clear crystal. */
export const CRYSTAL_MAT = 1;

/** A mesh of parts: tint is sRGB bytes, mat is per vertex. */
export interface PartMesh {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly tint: Uint8Array;
  readonly mat: Uint8Array;
  readonly index: Uint32Array;
}

/** Builds a PartMesh vertex by vertex. */
export class PartBuilder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly tint: number[] = [];
  readonly mat: number[] = [];
  readonly idx: number[] = [];
  get vertexCount(): number { return this.pos.length / 3; }
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number, mat = 0): number {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.tint.push(r, g, b); this.mat.push(mat);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  /** Smooth normals for the vertices from `v0` and the triangles from index `i0` (area weighted). */
  smooth(v0: number, i0: number): void {
    const { pos, nor, idx } = this;
    for (let k = v0 * 3; k < nor.length; k++) nor[k] = 0;
    for (let t = i0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { nor[o] += nx; nor[o + 1] += ny; nor[o + 2] += nz; }
    }
    for (let k = v0 * 3; k < nor.length; k += 3) {
      const l = Math.hypot(nor[k], nor[k + 1], nor[k + 2]) || 1;
      nor[k] /= l; nor[k + 1] /= l; nor[k + 2] /= l;
    }
  }
  build(): PartMesh {
    return { position: Float32Array.from(this.pos), normal: Float32Array.from(this.nor), tint: Uint8Array.from(this.tint), mat: Uint8Array.from(this.mat), index: Uint32Array.from(this.idx) };
  }
}
