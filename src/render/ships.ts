/**
 * The ships and boats of the harbour towns near the camera (S2, S3): each a mesh of its own, riding the swell
 * where the water is drawn (rising and falling with the waves, pitching and rolling with them, a long keel slower
 * than a short one) and going where the fleet's day puts it (world/fleet.ts): the fishing boats out at dawn under
 * sail and home in the afternoon, the ships at their berths with their gangplanks out to the pier. Each pose goes
 * to the decks (world/deck.ts), which the hero walks. The building shader draws them, so no new shader compiles.
 */
import { Group, type Mesh, type Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { gangplankMesh, hullHalf, shipMesh, type ShipPlan } from '@futuremagic/settlement';
import { HULLS, HULL_POSES, HULL_STATIONS, WATER } from './materials/waterInputs';
import { buildingMeshAt } from './materials/building';
import { afloatAt, fleetOf, type Afloat as Place, type Vessel } from '../world/fleet';
import type { Decks, Pose } from '../world/deck';
import type { Town } from '../world/town';

/** Vessels are drawn within this of the camera (m); their decks are walked within ABOARD. */
const SEEN = 1500, ABOARD = 250;
/** How fast a hull follows the waves' tilt (per second): a long keel answers them slowly. */
const FOLLOW = 2.5;
/** The gangplank's mesh is made this long, then stretched to the gap it spans (m). */
const PLANK_MADE = 2.5;
/** The water is cut this far inside a hull's skin at the waterline (m): it rolls and pitches, and the cut does not. */
const HULL_MARGIN = 0.12;
/** A plan's half widths at the waterline, at the water shader's stations from stern to bow. */
const WIDTHS = new WeakMap<ShipPlan, number[]>();
function waterline(p: ShipPlan): number[] {
  let w = WIDTHS.get(p);
  if (!w) {
    w = [];
    for (let j = 0; j < HULL_STATIONS; j++) w.push(Math.max(0, hullHalf(p, Math.max(-0.995, Math.min(0.995, -1 + (2 * j) / (HULL_STATIONS - 1))) * p.length / 2, 0) - HULL_MARGIN));
    WIDTHS.set(p, w);
  }
  return w;
}

interface Afloat {
  readonly id: string;
  readonly v: Vessel;
  /** Its meshes (sails furled, and set for a boat that goes out), built when first near; its gangplank. */
  furled: Mesh | null;
  set: Mesh | null;
  plank: Mesh | null;
  readonly pose: Pose;
}

export interface ShipsHost {
  readonly stage: Stage;
  /** The towns standing on the land so far (the harbour towns among them have fleets). */
  readonly harbours: () => readonly Town[];
  /** The water's surface as drawn at a point, waves included (null: none there, or not drawn). */
  readonly surface: (x: number, z: number) => number | null;
  /** Water depth at a point (0 on land). */
  readonly water: (x: number, z: number) => number;
  /** The decks the hero walks: each near ship's pose goes there. */
  readonly decks: Decks;
}

export class ShipsView {
  private readonly group = new Group();
  private readonly fleets = new Map<string, Afloat[]>();
  private added = false;

  constructor(private readonly h: ShipsHost) {}

  /**
   * Every frame, before the hero moves: the vessels near `cam` where the hour puts them, on the waves (a hero on a
   * deck goes with it). One mesh is built per frame at most.
   */
  float(cam: Vector3, hours: number, dt: number): void {
    if (!this.added) { this.added = true; void this.h.stage.add(this.group); }
    let built = false;
    const hulls: { far: number; a: Afloat }[] = [];
    for (const t of this.h.harbours()) {
      const h = t.plan.harbour;
      if (!h) continue;
      const dx = t.decision.x - cam.x, dz = t.decision.z - cam.z, near = dx * dx + dz * dz < (SEEN + 2500) ** 2;
      let fleet = this.fleets.get(t.decision.id);
      if (!near) { if (fleet) this.drop(fleet); this.fleets.delete(t.decision.id); continue; }
      if (!fleet) {
        fleet = fleetOf(h, t.decision.seed ?? 0, this.h.water).map((v, i) => ({ id: `${t.decision.id}/${i}`, v, furled: null, set: null, plank: null, pose: { x: v.mooring.x, y: 0, z: v.mooring.z, ux: v.mooring.ux, uz: v.mooring.uz, pitch: 0, roll: 0 } }));
        this.fleets.set(t.decision.id, fleet);
      }
      for (const a of fleet) {
        const at = afloatAt(a.v, hours), d = Math.hypot(at.x - cam.x, at.z - cam.z);
        const want = d < SEEN ? (at.sailing ? 'set' : 'furled') : null;
        if (want && !a[want] && !built) { a[want] = this.build(a.v, want); built = true; }
        for (const k of ['furled', 'set'] as const) { const m = a[k]; if (m) m.visible = want === k; }
        if (!want) { this.h.decks.drop(a.id); if (a.plank) a.plank.visible = false; continue; }
        this.ride(a, at, dt);
        hulls.push({ far: d, a });
        const m = a[want];
        if (m) { m.position.set(a.pose.x, a.pose.y, a.pose.z); m.rotation.set(-a.pose.roll, -Math.atan2(a.pose.uz, a.pose.ux), a.pose.pitch); m.updateMatrix(); }
        // Its decks walked near the hero; moored (not out on a trip), its gangplank out to the land.
        const moored = at.x === a.v.mooring.x && at.z === a.v.mooring.z;
        if (d < ABOARD) this.h.decks.move(a.id, a.v.mooring.plan, a.pose, moored ? a.v.mooring : null, at.sailing);
        else this.h.decks.drop(a.id);
        this.lay(a, d < ABOARD && moored);
      }
    }
    this.cut(hulls);
  }

  /** The nearest hulls to the water shader: no water is drawn inside them. */
  private cut(hulls: { far: number; a: Afloat }[]): void {
    hulls.sort((x, y) => x.far - y.far);
    const len = WATER.hullLength.array as number[], wid = WATER.hullWidth.array as number[];
    for (let i = 0; i < HULLS; i++) {
      const a = hulls[i]?.a;
      len[i] = a ? a.v.mooring.plan.length / 2 : 0;
      if (!a) continue;
      HULL_POSES[i].set(a.pose.x, a.pose.z, a.pose.ux, a.pose.uz);
      const w = waterline(a.v.mooring.plan);
      for (let j = 0; j < HULL_STATIONS; j++) wid[i * HULL_STATIONS + j] = w[j];
    }
  }

  private build(v: Vessel, sails: 'furled' | 'set'): Mesh {
    const m = buildingMeshAt(shipMesh(v.mooring.plan, 0, 0, 1, 0, 0, [0, 0, 0], sails, true), 0, 0, 0, 'ship');
    m.rotation.order = 'YZX';
    this.group.add(m);
    return m;
  }

  /** On the waves at its place: up and down with the surface under its middle, its tilt following bow and side. */
  private ride(a: Afloat, at: Place, dt: number): void {
    const p = a.v.mooring.plan, L = p.length * 0.35, B = p.beam * 0.4, o = a.pose;
    const sea = (x: number, z: number) => this.h.surface(x, z) ?? 0;
    const bow = sea(at.x + at.ux * L, at.z + at.uz * L), stern = sea(at.x - at.ux * L, at.z - at.uz * L);
    const port = sea(at.x - at.uz * B, at.z + at.ux * B), star = sea(at.x + at.uz * B, at.z - at.ux * B);
    const k = Math.min(1, dt * FOLLOW);
    o.pitch += (Math.atan2(bow - stern, 2 * L) - o.pitch) * k;
    o.roll += (Math.atan2(port - star, 2 * B) * 0.7 - o.roll) * k;
    o.x = at.x; o.z = at.z; o.ux = at.ux; o.uz = at.uz;
    o.y = (bow + stern + port + star) / 4;
  }

  /** Its gangplank from the land up to its gangway, following the deck as it rises and falls (none: not out). */
  private lay(a: Afloat, out: boolean): void {
    const ends = out ? this.h.decks.plankOf(a.id) : null;
    if (!ends) { if (a.plank) a.plank.visible = false; return; }
    if (!a.plank) {
      a.plank = buildingMeshAt(gangplankMesh(PLANK_MADE), 0, 0, 0, 'gangplank');
      a.plank.rotation.order = 'YZX';
      this.group.add(a.plank);
    }
    const { foot, head } = ends, dx = head.x - foot.x, dy = head.y - foot.y, dz = head.z - foot.z, run = Math.hypot(dx, dz);
    const m = a.plank;
    m.visible = true;
    m.position.set(foot.x, foot.y, foot.z);
    m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, run));
    m.scale.set(Math.hypot(run, dy) / PLANK_MADE, 1, 1);
    m.updateMatrix();
  }

  private drop(fleet: Afloat[]): void {
    for (const a of fleet) {
      this.h.decks.drop(a.id);
      for (const m of [a.furled, a.set, a.plank]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
  }
}
