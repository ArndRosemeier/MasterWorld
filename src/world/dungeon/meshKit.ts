/**
 * A small mesh kit for built spaces (pure): quads, boxes and cylinders into the building mesh format of
 * @futuremagic/settlement (positions, normals, uv in metres, a BuildingMat and a tint per vertex), so
 * dungeons draw with the town's one building shader.
 */
import { BuildingMat, type BuildingMesh } from '@futuremagic/settlement';

export type Tint = readonly [number, number, number];

export class MeshKit {
  private p: number[] = [];
  private n: number[] = [];
  private uv: number[] = [];
  private mat: number[] = [];
  private tint: number[] = [];
  private idx: number[] = [];

  get empty(): boolean { return this.idx.length === 0; }

  /** A quad a, b, c, d (counter-clockwise seen from the front), uv from each corner's (u, v) in metres. */
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[][], mat: BuildingMat, tint: Tint): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.p.length / 3;
    [a, b, c, d].forEach((q, i) => {
      this.p.push(q[0], q[1], q[2]);
      this.n.push(nx, ny, nz);
      this.uv.push(uv[i][0], uv[i][1]);
      this.mat.push(mat);
      this.tint.push(tint[0], tint[1], tint[2]);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A triangle (counter-clockwise seen from the front), uv from x and z. */
  tri(a: number[], b: number[], c: number[], mat: BuildingMat, tint: Tint): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.p.length / 3;
    for (const q of [a, b, c]) {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.uv.push(q[0], q[2]);
      this.mat.push(mat); this.tint.push(tint[0], tint[1], tint[2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** A vertical wall face from (x0, z0) to (x1, z1), y0 .. y1, facing left of the direction of travel. */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: BuildingMat, tint: Tint, u0 = 0): void {
    if (y1 - y0 < 0.005) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1], [[u0, y0], [u0, y1], [u0 + len, y1], [u0 + len, y0]], mat, tint);
  }

  /** A horizontal rectangle at height y, facing up (or down). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean, mat: BuildingMat, tint: Tint): void {
    if (up) this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], mat, tint);
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], mat, tint);
  }

  /** A box centred at (x, y0 + sy/2, z), turned by yaw about +y. */
  box(x: number, y0: number, z: number, sx: number, sy: number, sz: number, yaw: number, mat: BuildingMat, tint: Tint): void {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (u: number, v: number, w: number) => [x + u * c + w * s, y0 + v, z - u * s + w * c];
    const hx = sx / 2, hz = sz / 2;
    const v = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)];
    const U = (a: number, b: number) => [[0, 0], [0, b], [a, b], [a, 0]];
    this.quad(v[4], v[7], v[6], v[5], U(sx, sz), mat, tint); // top
    this.quad(v[0], v[1], v[2], v[3], U(sx, sz), mat, tint); // bottom
    this.quad(v[0], v[4], v[5], v[1], U(sy, sx), mat, tint); // -z
    this.quad(v[2], v[6], v[7], v[3], U(sy, sx), mat, tint); // +z
    this.quad(v[3], v[7], v[4], v[0], U(sy, sz), mat, tint); // -x
    this.quad(v[1], v[5], v[6], v[2], U(sy, sz), mat, tint); // +x
  }

  /** An upright cylinder (a barrel, a vat, a candle), `bulge` widens its middle. */
  cylinder(x: number, y0: number, z: number, r: number, h: number, seg: number, mat: BuildingMat, tint: Tint, bulge = 0): void {
    const rings = bulge ? [0, 0.5, 1] : [0, 1];
    const rad = (t: number) => r * (1 + bulge * Math.sin(Math.PI * t));
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      for (let q = 0; q + 1 < rings.length; q++) {
        const t0 = rings[q], t1 = rings[q + 1], r0 = rad(t0), r1 = rad(t1);
        const P = (a: number, rr: number, t: number) => [x + Math.cos(a) * rr, y0 + t * h, z + Math.sin(a) * rr];
        this.quad(P(a0, r0, t0), P(a0, r1, t1), P(a1, r1, t1), P(a1, r0, t0), [[a0 * r, t0 * h], [a0 * r, t1 * h], [a1 * r, t1 * h], [a1 * r, t0 * h]], mat, tint);
      }
      const c = [x, y0 + h, z];
      const p0 = [x + Math.cos(a0) * r, y0 + h, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y0 + h, z + Math.sin(a1) * r];
      this.tri(c, p1, p0, mat, tint);
    }
  }

  mesh(): BuildingMesh {
    return {
      position: Float32Array.from(this.p), normal: Float32Array.from(this.n), uv: Float32Array.from(this.uv),
      mat: Uint8Array.from(this.mat), tint: Uint8Array.from(this.tint), index: Uint32Array.from(this.idx),
    };
  }
}

export { BuildingMat };
