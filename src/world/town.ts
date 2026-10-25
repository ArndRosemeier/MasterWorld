/**
 * Towns on the land (plan 7): a town decision planned into streets, plots, buildings and fixtures
 * (@futuremagic/settlement), and what the ground is at a point of it (street, building, yard) for
 * the terrain, the plants and later the ground's look. Pure, runs in workers.
 */
import { buildingEntrance, distToPoly, planTown, pointInPoly, polyBounds, type Entrance, type TownBuilding, type TownPlan } from '@futuremagic/settlement';
import type { TownDecision } from './decisions';
import type { Terrain } from './terrain';

/** Ground of a town, per square metre of its raster. */
export const TownGround = {
  /** Outside the town. */
  None: 0,
  /** Plots, yards and gardens. */
  Yard: 1,
  /** Roads, lanes and the edge track. */
  Street: 2,
  /** The market place. */
  Market: 3,
  /** Under a building. */
  Building: 4,
} as const;
export type TownGround = (typeof TownGround)[keyof typeof TownGround];

/** Raster cell size, metres. */
export const TOWN_RASTER = 1;

export class Town {
  readonly plan: TownPlan;
  /** The ground raster over the town's bounds (TownGround per TOWN_RASTER). */
  private readonly ground: Uint8Array;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;

  /** `t`: the land, already settled (its heights calmed for this town). */
  constructor(readonly decision: TownDecision, t: Terrain) {
    this.plan = planTown({ seed: t.seed, x: decision.x, z: decision.z, radius: decision.radius, height: t.height.bind(t), water: t.waterDepth.bind(t) });
    let [x0, z0, x1, z1] = polyBounds(this.plan.outline);
    for (const s of this.plan.streets) {
      const b = polyBounds(s.pts);
      x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]);
    }
    this.x0 = Math.floor(x0 - 4); this.z0 = Math.floor(z0 - 4);
    this.nx = Math.ceil((x1 + 4 - this.x0) / TOWN_RASTER); this.nz = Math.ceil((z1 + 4 - this.z0) / TOWN_RASTER);
    this.ground = new Uint8Array(this.nx * this.nz);
    this.rasterise();
  }

  /** What the ground is at a point. */
  groundAt(x: number, z: number): TownGround {
    const i = Math.floor((x - this.x0) / TOWN_RASTER), j = Math.floor((z - this.z0) / TOWN_RASTER);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return TownGround.None;
    return this.ground[i + j * this.nx] as TownGround;
  }

  /** Does a body of radius `r` standing at (x, z) touch a building's walls (or the temple's sanctuary)? */
  solid(x: number, z: number, r: number): boolean {
    if (!this.near(x, z, r)) return false;
    for (const b of this.plan.buildings) {
      const s = b.sanctuary;
      if (s && Math.hypot(x - s.cx, z - s.cz) < s.r + r) return true;
      const reach = Math.max(b.hu, b.hv) * 1.5 + 3 + r; // the porch stands out before the door
      if (Math.abs(x - b.cx) > reach || Math.abs(z - b.cz) > reach) continue;
      if (pointInPoly(b.poly, x, z) || distToPoly(b.poly, x, z) < r) return true;
      // The temple porch's columns.
      const posts = this.entrance(b).posts;
      if (posts.length) {
        const [u, v] = Town.local(b, x, z);
        for (const p of posts) if (Math.hypot(Math.max(p.u0 - u, 0, u - p.u1), Math.max(p.v0 - v, 0, v - p.v1)) < r) return true;
      }
    }
    return false;
  }

  /** What stands before each building's door (steps, the temple's porch), by building. */
  private entrances: Entrance[] | null = null;

  /** Where (x, z) lies in a building's frame: u across, v from the front to the back. */
  private static local(b: TownBuilding, x: number, z: number): [number, number] {
    const dx = x - b.cx, dz = z - b.cz;
    return [dx * Math.cos(b.angle) + dz * Math.sin(b.angle), dx * b.vx + dz * b.vz];
  }

  private entrance(b: TownBuilding): Entrance {
    this.entrances ??= this.plan.buildings.map(buildingEntrance);
    return this.entrances[b.id];
  }

  /** The highest step or porch floor at (x, z) (world y), or null where there is none. */
  stand(x: number, z: number): number | null {
    if (!this.near(x, z, 0)) return null;
    let top: number | null = null;
    for (const b of this.plan.buildings) {
      const reach = Math.max(b.hu, b.hv) + 4;
      if (Math.abs(x - b.cx) > reach || Math.abs(z - b.cz) > reach) continue;
      const [u, v] = Town.local(b, x, z);
      for (const f of this.entrance(b).floors) {
        if (u >= f.u0 && u <= f.u1 && v >= f.v0 && v <= f.v1) top = Math.max(top ?? -Infinity, b.floorY + f.top);
      }
    }
    return top;
  }

  /** Is the point within reach of the town (its raster bounds grown by `margin`)? */
  near(x: number, z: number, margin: number): boolean {
    return x > this.x0 - margin && z > this.z0 - margin && x < this.x0 + this.nx * TOWN_RASTER + margin && z < this.z0 + this.nz * TOWN_RASTER + margin;
  }

  private rasterise(): void {
    const p = this.plan;
    this.fill(p.outline, TownGround.Yard);
    for (const s of p.streets) this.stroke(s.closed ? [...s.pts, s.pts[0], s.pts[1]] : s.pts, s.width / 2, TownGround.Street);
    this.fill(p.market, TownGround.Market);
    for (const b of p.buildings) this.fill(b.poly, TownGround.Building);
  }

  /** Every cell whose middle lies in the polygon gets `v`. */
  private fill(poly: ArrayLike<number>, v: TownGround): void {
    const n = poly.length >> 1;
    let z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < n; k++) { z0 = Math.min(z0, poly[k * 2 + 1]); z1 = Math.max(z1, poly[k * 2 + 1]); }
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / TOWN_RASTER)), j1 = Math.min(this.nz - 1, Math.ceil((z1 - this.z0) / TOWN_RASTER));
    const xs: number[] = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * TOWN_RASTER;
      xs.length = 0;
      for (let k = 0; k < n; k++) {
        const ax = poly[k * 2], az = poly[k * 2 + 1], bx = poly[((k + 1) % n) * 2], bz = poly[((k + 1) % n) * 2 + 1];
        if ((az <= z) !== (bz <= z)) xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - this.x0) / TOWN_RASTER - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((xs[k + 1] - this.x0) / TOWN_RASTER - 0.5));
        for (let i = i0; i <= i1; i++) this.ground[i + j * this.nx] = v;
      }
    }
  }

  /** Every cell within `half` of the polyline gets `v`. */
  private stroke(pts: ArrayLike<number>, half: number, v: TownGround): void {
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - half - this.x0) / TOWN_RASTER)), i1 = Math.min(this.nx - 1, Math.ceil((Math.max(ax, bx) + half - this.x0) / TOWN_RASTER));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - half - this.z0) / TOWN_RASTER)), j1 = Math.min(this.nz - 1, Math.ceil((Math.max(az, bz) + half - this.z0) / TOWN_RASTER));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * TOWN_RASTER, z = this.z0 + (j + 0.5) * TOWN_RASTER;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const ex = ax + dx * t - x, ez = az + dz * t - z;
        if (ex * ex + ez * ez <= half * half) this.ground[i + j * this.nx] = v;
      }
    }
  }
}
