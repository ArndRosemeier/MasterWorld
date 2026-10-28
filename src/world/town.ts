/**
 * Towns on the land (plan 7): a town decision planned into streets, plots, buildings and fixtures
 * (@futuremagic/settlement), and what the ground is at a point of it (street, building, yard) for
 * the terrain, the plants and later the ground's look. Pure, runs in workers.
 */
import { buildingEntrance, distToPoly, fixtureBlocks, wallBlocks, type Fixture, planTown, pointInPoly, polyBounds, polyCentroid, type Entrance, type Field, type TownBuilding, type TownPlan } from '@futuremagic/settlement';
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
  /** Open farm ground: the grass between the strips, round the farmsteads (no trees). */
  Farmland: 5,
  /** A field under crop, or a paddock's pasture (fieldAt says which). */
  Field: 6,
  /** A farm track, or a road out in the fields (trodden earth). */
  Path: 7,
} as const;
export type TownGround = (typeof TownGround)[keyof typeof TownGround];

/** Raster cell size, metres. */
export const TOWN_RASTER = 1;

export class Town {
  readonly plan: TownPlan;
  /** The ground raster over the town's bounds (TownGround per TOWN_RASTER). */
  private readonly ground: Uint8Array;
  /** The field per cell (its id + 1; 0 none). */
  private readonly fieldIds: Uint16Array;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;

  /**
   * `t`: the land, already settled (its heights calmed for this town). `plan`: the town's plan if it was
   * planned elsewhere (a worker plans a settlement founded while playing: it takes too long for a frame).
   */
  constructor(readonly decision: TownDecision, t: Terrain, plan?: TownPlan) {
    this.plan = plan ?? townPlanOf(decision, t);
    let [x0, z0, x1, z1] = polyBounds(this.plan.farmEdge);
    for (const s of this.plan.streets) {
      const b = polyBounds(s.pts);
      x0 = Math.min(x0, b[0]); z0 = Math.min(z0, b[1]); x1 = Math.max(x1, b[2]); z1 = Math.max(z1, b[3]);
    }
    this.x0 = Math.floor(x0 - 4); this.z0 = Math.floor(z0 - 4);
    this.nx = Math.ceil((x1 + 4 - this.x0) / TOWN_RASTER); this.nz = Math.ceil((z1 + 4 - this.z0) / TOWN_RASTER);
    this.ground = new Uint8Array(this.nx * this.nz);
    this.fieldIds = new Uint16Array(this.nx * this.nz);
    this.rasterise();
  }

  /** What the ground is at a point. */
  groundAt(x: number, z: number): TownGround {
    const i = Math.floor((x - this.x0) / TOWN_RASTER), j = Math.floor((z - this.z0) / TOWN_RASTER);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return TownGround.None;
    return this.ground[i + j * this.nx] as TownGround;
  }

  /** The field at a point (crop and rows), or null. */
  fieldAt(x: number, z: number): Field | null {
    const i = Math.floor((x - this.x0) / TOWN_RASTER), j = Math.floor((z - this.z0) / TOWN_RASTER);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return null;
    const f = this.fieldIds[i + j * this.nx];
    return f ? this.plan.fields[f - 1] : null;
  }

  /** The paddocks' fences as segments (ax, az, bx, bz), with each paddock's bounds. */
  private fences: { box: [number, number, number, number]; seg: number[] }[] | null = null;

  /** Does a body of radius `r` at (x, z) touch a paddock's fence (the gate is open)? */
  fenced(x: number, z: number, r: number): boolean {
    this.fences ??= this.plan.props.flatMap((p) => {
      if (p.kind !== 'fence') return [];
      const seg: number[] = [];
      for (let k = 0; k + 5 < p.posts.length; k += 3) {
        if (Math.hypot(p.posts[k + 3] - p.posts[k], p.posts[k + 5] - p.posts[k + 2]) > 4) continue; // the gate
        seg.push(p.posts[k], p.posts[k + 2], p.posts[k + 3], p.posts[k + 5]);
      }
      const xs = seg.filter((_, i) => i % 2 === 0), zs = seg.filter((_, i) => i % 2 === 1);
      return [{ box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as [number, number, number, number], seg }];
    });
    const d = r + 0.08;
    for (const f of this.fences) {
      if (x < f.box[0] - d || z < f.box[1] - d || x > f.box[2] + d || z > f.box[3] + d) continue;
      for (let k = 0; k < f.seg.length; k += 4) {
        const ax = f.seg[k], az = f.seg[k + 1], dx = f.seg[k + 2] - ax, dz = f.seg[k + 3] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if ((ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2 < d * d) return true;
      }
    }
    return false;
  }

  /** The fixtures out of doors by 8 m square (for `fixtureAt`). */
  private fixtureGrid: Map<string, Fixture[]> | null = null;

  /** Does a body of radius `r` at (x, z) run into a fixture out of doors (a well, a stall, a woodpile ...)? The hero's; townsfolk use them. */
  fixtureAt(x: number, z: number, r: number): boolean {
    if (!this.near(x, z, r)) return false;
    if (!this.fixtureGrid) {
      this.fixtureGrid = new Map();
      for (const f of this.plan.fixtures) {
        const k = `${Math.floor(f.x / 8)},${Math.floor(f.z / 8)}`;
        (this.fixtureGrid.get(k) ?? this.fixtureGrid.set(k, []).get(k)!).push(f);
      }
    }
    const i = Math.floor(x / 8), j = Math.floor(z / 8);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const f of this.fixtureGrid.get(`${i + di},${j + dj}`) ?? []) if (fixtureBlocks(f, x, z, r)) return true;
    }
    return false;
  }

  /** Does a body of radius `r` standing at (x, z) touch a building's walls (or the temple's sanctuary, a fence, or the town wall away from its gates)? */
  solid(x: number, z: number, r: number, skip = -1): boolean {
    if (!this.near(x, z, r)) return false;
    if (this.fenced(x, z, r)) return true;
    if (this.plan.wall && wallBlocks(this.plan.wall, x, z, r)) return true;
    for (const b of this.plan.buildings) {
      if (b.id === skip) continue;
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
    // The farmland first: open ground, the fields on it, the farmsteads' grounds and yards. Round a hamlet
    // or village all of it is cleared, not only the furlongs (its few fields would stand in the wood).
    const small = this.decision.size === 'waystation' || this.decision.size === 'hamlet' || this.decision.size === 'village';
    if (small) this.fill(p.farmEdge, TownGround.Farmland);
    for (const f of p.furlongs) this.fill(f, TownGround.Farmland);
    for (const fm of p.farms) {
      const ids = [fm.house, fm.barn, fm.stable].filter((i) => i >= 0);
      this.fill(hull([...ids.flatMap((i) => p.buildings[i].poly), ...p.paddocks[fm.paddock].poly, ...fm.yard], 6), TownGround.Farmland);
    }
    for (const f of p.fields) this.fill(f.poly, TownGround.Field, f.id + 1);
    for (const fm of p.farms) this.fill(fm.yard, TownGround.Yard);
    if (small) {
      // A hamlet's or village's blocks are wide: inside the outline it is open ground (kept grass, no
      // wood), the plots round the houses its yards and gardens.
      this.fill(p.outline, TownGround.Farmland);
      for (const l of p.lots) this.fill(l.poly, TownGround.Yard);
    } else this.fill(p.outline, TownGround.Yard);
    // Roads are cobbled in town; out in the fields they are earth, like the farm tracks.
    for (const s of p.streets) {
      const pts = s.closed ? [...s.pts, s.pts[0], s.pts[1]] : s.pts;
      if (s.kind === 'path') { this.stroke(pts, s.width / 2, TownGround.Path); continue; }
      if (s.kind !== 'road') { this.stroke(pts, s.width / 2, TownGround.Street); continue; }
      for (let k = 0; k + 3 < pts.length; k += 2) {
        const inside = pointInPoly(p.outline, (pts[k] + pts[k + 2]) / 2, (pts[k + 1] + pts[k + 3]) / 2);
        this.stroke(pts.slice(k, k + 4), s.width / 2, inside ? TownGround.Street : TownGround.Path);
      }
    }
    this.fill(p.market, TownGround.Market);
    // A capital's seat of rule stands in a paved court.
    if (p.seatGrounds) this.fill(p.seatGrounds.outer, TownGround.Market);
    for (const b of p.buildings) this.fill(b.poly, TownGround.Building);
  }

  /** Every cell whose middle lies in the polygon gets `v` (and the field id `field`, if given). */
  private fill(poly: ArrayLike<number>, v: TownGround, field = 0): void {
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
        for (let i = i0; i <= i1; i++) { this.ground[i + j * this.nx] = v; this.fieldIds[i + j * this.nx] = field; }
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
        if (ex * ex + ez * ez <= half * half) { this.ground[i + j * this.nx] = v; this.fieldIds[i + j * this.nx] = 0; }
      }
    }
  }
}

/** The convex hull of points (x, z, ...), grown by `grow` m (each corner pushed out from the middle). */
function hull(pts: number[], grow: number): number[] {
  const p: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) p.push([pts[i], pts[i + 1]]);
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const h = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  const cx = h.reduce((s, q) => s + q[0], 0) / h.length, cz = h.reduce((s, q) => s + q[1], 0) / h.length;
  return h.flatMap(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1; return [x + ((x - cx) / d) * grow, z + ((z - cz) / d) * grow]; });
}

/** A town's plan (AG settlement planTown, the one planner for every size), on the land as settled. */
/** The town of this id among `towns` (undefined: none). */
export function townById(towns: readonly Town[], id: string): Town | undefined {
  return towns.find((t) => t.decision.id === id);
}

export function townPlanOf(d: TownDecision, t: Terrain): TownPlan {
  return planTown({ seed: d.seed ?? t.seed, size: d.size, x: d.x, z: d.z, radius: d.radius, height: t.height.bind(t), water: t.waterDepth.bind(t), farmland: d.size !== 'waystation' });
}

/** A building's key among every town's (building ids count from 0 in each town). */
export const houseKey = (town: string, building: number): string => `${town}#${building}`;

/** Where a hero starts in a town (a new game, the loop check): on its market or green, a few steps from the middle. */
export function marketStart(plan: TownPlan): { x: number; z: number } {
  const [x, z] = polyCentroid(plan.market);
  return { x: x + 5, z: z + 4 };
}
