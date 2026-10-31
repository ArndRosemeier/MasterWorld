/**
 * The ships and boats of the harbour towns near the camera (S2, S3): each a mesh of its own, riding the swell
 * where the water is drawn (rising and falling with the waves, pitching and rolling with them, a long keel slower
 * than a short one) and going where the fleet's day puts it (world/fleet.ts): the fishing boats out at dawn under
 * sail and home in the afternoon, the ships at their berths with their gangplanks out to the pier. Each pose goes
 * to the decks (world/deck.ts), which the hero walks. The building shader draws them, so no new shader compiles.
 */
import { Group, type Mesh, type Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { gangplankMesh, hullHalf, planShip, ropeMesh, shipMesh, type Mooring, type ShipPlan } from '@futuremagic/settlement';
import { HULLS, HULL_POSES, HULL_STATIONS, WATER } from './materials/waterInputs';
import { buildingMeshAt } from './materials/building';
import { LIE_OVER, afloatAt, farBerth, fleetOf, passageShip, voyageAfloat, wreckLying, type Afloat as Place, type Vessel, type Voyage } from '../world/fleet';
import type { Decks, Pose } from '../world/deck';
import type { Town } from '../world/town';

/** Vessels are drawn within this of the camera (m); their decks are walked within ABOARD. */
const SEEN = 1500, ABOARD = 250;
/** How fast a hull follows the waves' tilt (per second): a long keel answers them slowly. */
const FOLLOW = 2.5;
/** A hauled rope is drawn this many times the mesh's thickness, so it reads against the standing rigging. */
const ROPE_THICK = 1.7;
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
  /** The voyages in the log (journeys by sea, S4): from which harbour town's ship, to which. */
  readonly voyages: () => readonly { readonly id: string; readonly from: string; readonly to: string; readonly v: Voyage }[];
  /** The wrecks in the log (S8, sea sights): where each lies, which way, its seed. */
  readonly wrecks: () => readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seed: number }[];
  /** The boats gone over (S9, castaways): where each floats keel up, which way, its seed. */
  readonly capsized?: () => readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seed: number }[];
  /** The boats the sea threw up on a strand (S9, sights `strand`), and the ground there. */
  readonly beached?: () => readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seed: number }[];
  readonly ground?: (x: number, z: number) => number;
}

/** How far an upturned boat's keel stands out of the water (m). */
const KEEL_OUT = 0.3;
/** How far a boat washed up lies over on her side (rad), and how deep in the sand (share of her draft). */
const BEACHED_LIST = 1.25, BEACHED_SUNK = 0.35;
/** What is left of her mast above the deck (m). */
const BEACHED_STUMP = 0.7;

export class ShipsView {
  private readonly group = new Group();
  private readonly fleets = new Map<string, Afloat[]>();
  /** The berth each voyage's ship comes in to at its far harbour (by voyage id), once that town stands. */
  private readonly berths = new Map<string, Mooring>();
  /** The ropes the crew haul on (one mesh each, stretched between its ends; kept for reuse). */
  private readonly ropeMeshes: Mesh[] = [];
  private added = false;

  /** The wrecks drawn now (near the camera), by id: her mesh, plan and pose on the bed. */
  private readonly sunk = new Map<string, { mesh: Mesh; plan: ShipPlan; pose: Pose }>();
  /** The boats gone over and the boats washed up drawn now, by id. */
  private readonly upturned = new Map<string, { mesh: Mesh; plan: ShipPlan }>();
  private readonly ashore = new Map<string, Mesh>();

  constructor(private readonly h: ShipsHost) {}

  /**
   * Every frame, before the hero moves: the vessels near `cam` where the hour puts them, on the waves (a hero on a
   * deck goes with it). One mesh is built per frame at most.
   */
  float(cam: Vector3, hours: number, dt: number): void {
    if (!this.added) { this.added = true; void this.h.stage.add(this.group); }
    let built = false;
    const hulls: { far: number; a: Afloat }[] = [];
    const towns = this.h.harbours();
    for (const t of towns) {
      const h = t.plan.harbour;
      if (!h) continue;
      // Its ship on a voyage now, if one is (she may be far from home: her fleet is kept while she is out).
      const voyage = this.voyageOf(t.decision.id, hours);
      const dx = t.decision.x - cam.x, dz = t.decision.z - cam.z, near = !!voyage || dx * dx + dz * dz < (SEEN + 2500) ** 2;
      let fleet = this.fleets.get(t.decision.id);
      if (!near) { if (fleet) this.drop(fleet); this.fleets.delete(t.decision.id); continue; }
      if (!fleet) {
        fleet = fleetOf(h, t.decision.seed ?? 0, this.h.water).map((v, i) => ({ id: `${t.decision.id}/${i}`, v, furled: null, set: null, plank: null, pose: { x: v.mooring.x, y: 0, z: v.mooring.z, ux: v.mooring.ux, uz: v.mooring.uz, pitch: 0, roll: 0 } }));
        this.fleets.set(t.decision.id, fleet);
      }
      const passage = voyage ? passageShip(fleet.map((a) => a.v)) : null;
      for (const a of fleet) {
        const out = passage === a.v && voyage ? this.sail(voyage, a.v, towns, hours) : null;
        // (The ship the hero stands on counts as here: after a sleep through the crossing she is far from where the camera
        // was, and must carry them on.)
        const at = out ?? afloatAt(a.v, hours), d = this.h.decks.ship === a.id ? 0 : Math.hypot(at.x - cam.x, at.z - cam.z);
        const want = d < SEEN ? (at.sailing ? 'set' : 'furled') : null;
        if (want && !a[want] && !built) { a[want] = this.build(a.v, want); built = true; }
        for (const k of ['furled', 'set'] as const) { const m = a[k]; if (m) m.visible = want === k; }
        if (!want) { this.h.decks.drop(a.id); if (a.plank) a.plank.visible = false; continue; }
        this.ride(a, at, dt);
        hulls.push({ far: d, a });
        const m = a[want];
        if (m) { m.position.set(a.pose.x, a.pose.y, a.pose.z); m.rotation.set(-a.pose.roll, -Math.atan2(a.pose.uz, a.pose.ux), a.pose.pitch); m.updateMatrix(); }
        // Its decks walked near the hero; moored (not out on a trip), its gangplank out to the land.
        const berth = at.berth ?? (at.x === a.v.mooring.x && at.z === a.v.mooring.z ? a.v.mooring : null), moored = !!berth;
        if (d < ABOARD) this.h.decks.move(a.id, a.v.mooring.plan, a.pose, berth, at.sailing);
        else this.h.decks.drop(a.id);
        this.lay(a, d < ABOARD && moored);
      }
    }
    this.cut(hulls);
    built = this.wrecked(cam, built);
    built = this.overturned(cam, built);
    this.beachedBoats(cam, built);
  }

  /** The boats the sea threw up on a strand near the camera (S9): on her side, half in the sand; one built a frame at most. */
  private beachedBoats(cam: Vector3, built: boolean): void {
    for (const b of this.h.beached?.() ?? []) {
      const near = Math.hypot(b.x - cam.x, b.z - cam.z) < SEEN, m = this.ashore.get(b.id);
      if (!near) { if (m) { this.group.remove(m); m.geometry.dispose(); this.ashore.delete(b.id); } continue; }
      if (m || built) continue;
      built = true;
      // Dismasted: her mast snapped off above the deck (the spar lies on the sand, world/sites.ts).
      const whole = planShip(b.seed, 'boat'), plan = { ...whole, masts: whole.masts.map((m) => ({ ...m, top: m.foot + BEACHED_STUMP, yards: [] })) };
      const mesh = buildingMeshAt(shipMesh(plan, 0, 0, 1, 0, 0, [0, 0, 0], 'furled', true), 0, 0, 0, 'boat washed up');
      mesh.rotation.order = 'YZX';
      mesh.position.set(b.x, (this.h.ground?.(b.x, b.z) ?? 0) + plan.draft * (1 - BEACHED_SUNK) * Math.cos(BEACHED_LIST), b.z);
      mesh.rotation.set(-BEACHED_LIST, -b.yaw, 0);
      mesh.updateMatrix();
      this.group.add(mesh);
      this.ashore.set(b.id, mesh);
    }
  }

  /** The boats gone over near the camera (S9): keel up, riding the waves where they float; one built a frame at most. */
  private overturned(cam: Vector3, built: boolean): boolean {
    const now = this.h.capsized?.() ?? [];
    for (const [id, u] of this.upturned) if (!now.some((c) => c.id === id)) { this.group.remove(u.mesh); u.mesh.geometry.dispose(); this.upturned.delete(id); }
    for (const c of now) {
      let u = this.upturned.get(c.id);
      if (Math.hypot(c.x - cam.x, c.z - cam.z) > SEEN) continue;
      if (!u) {
        if (built) continue;
        built = true;
        const plan = planShip(c.seed, 'boat');
        const mesh = buildingMeshAt(shipMesh(plan, 0, 0, 1, 0, 0, [0, 0, 0], 'furled', true), 0, 0, 0, 'capsized boat');
        mesh.rotation.order = 'YZX';
        this.group.add(mesh);
        this.upturned.set(c.id, (u = { mesh, plan }));
      }
      // Rolled right over: the keel (−draft) now stands up out of the water.
      u.mesh.position.set(c.x, (this.h.surface(c.x, c.z) ?? 0) - u.plan.draft + KEEL_OUT, c.z);
      u.mesh.rotation.set(-Math.PI, -c.yaw, 0);
      u.mesh.updateMatrix();
    }
    return built;
  }

  /** The wrecks near the camera on the bed (S8), their decks walked (swum) near the hero; one built a frame at most. */
  private wrecked(cam: Vector3, built: boolean): boolean {
    for (const w of this.h.wrecks()) {
      const d = Math.hypot(w.x - cam.x, w.z - cam.z);
      let s = this.sunk.get(w.id);
      if (d > SEEN) {
        if (s) { this.group.remove(s.mesh); s.mesh.geometry.dispose(); this.sunk.delete(w.id); this.h.decks.drop(w.id); }
        continue;
      }
      if (!s) {
        if (built) continue;
        built = true;
        const { plan, pose } = wreckLying(w, -this.h.water(w.x, w.z));
        const mesh = buildingMeshAt(shipMesh(plan, 0, 0, 1, 0, 0, [0, 0, 0], 'furled', true), 0, 0, 0, 'wreck');
        mesh.rotation.order = 'YZX';
        mesh.position.set(pose.x, pose.y, pose.z);
        mesh.rotation.set(-pose.roll, -Math.atan2(pose.uz, pose.ux), pose.pitch);
        mesh.updateMatrix();
        this.group.add(mesh);
        this.sunk.set(w.id, (s = { mesh, plan, pose }));
      }
      if (d < ABOARD) this.h.decks.move(w.id, s.plan, s.pose, null, false, true); else this.h.decks.drop(w.id);
    }
    return built;
  }

  /** The voyage the ship of `town` is on at `hours` (sailing, lying at the far quay or sailing home), if any. */
  private voyageOf(town: string, hours: number): { readonly id: string; readonly to: string; readonly v: Voyage } | null {
    let best: { readonly id: string; readonly to: string; readonly v: Voyage } | null = null;
    for (const o of this.h.voyages()) if (o.from === town && o.v.at <= hours && hours < o.v.arrive + LIE_OVER + (o.v.arrive - o.v.at) && (!best || o.v.at > best.v.at)) best = o;
    return best;
  }

  /** Where the passage ship is on her voyage (her far berth found once the far town stands; till then off its shore). */
  private sail(o: { readonly id: string; readonly to: string; readonly v: Voyage }, ship: Vessel, towns: readonly Town[], hours: number): Place | null {
    let berth = this.berths.get(o.id);
    if (!berth) {
      const far = towns.find((t) => t.decision.id === o.to), h = far?.plan.harbour;
      const at = h ? farBerth(h, far!.decision.seed ?? 0, ship.mooring.plan) : null;
      if (at) this.berths.set(o.id, (berth = at));
    }
    // (No berth yet: she makes for the end of her way over the sea, lying there head out.)
    const r = o.v.route, n = r.length;
    const to = berth ?? { ...ship.mooring, x: r[n - 2], z: r[n - 1], ux: Math.sign(r[n - 4] - r[n - 2]) || 1, uz: 0 };
    return voyageAfloat(o.v, ship.mooring, to, hours);
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
    this.span(a.plank, ends.foot, ends.head, PLANK_MADE);
  }

  /** Each frame, after the crews are placed: a rope along each line from a hand up to its yard. */
  ropes(lines: readonly { readonly from: { x: number; y: number; z: number }; readonly to: { x: number; y: number; z: number } }[]): void {
    for (const [i, l] of lines.entries()) {
      let m = this.ropeMeshes[i];
      if (!m) {
        m = buildingMeshAt(ropeMesh(1), 0, 0, 0, 'rope');
        m.rotation.order = 'YZX';
        this.group.add(m);
        this.ropeMeshes.push(m);
      }
      this.span(m, l.from, l.to, 1, ROPE_THICK);
    }
    for (let i = lines.length; i < this.ropeMeshes.length; i++) this.ropeMeshes[i].visible = false;
  }

  /** `m` (made `made` long along +x) laid from `a` to `b`. */
  private span(m: Mesh, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, made: number, thick = 1): void {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, run = Math.hypot(dx, dz);
    m.visible = true;
    m.position.set(a.x, a.y, a.z);
    m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, run));
    m.scale.set(Math.hypot(run, dy) / made, thick, thick);
    m.updateMatrix();
  }

  private drop(fleet: Afloat[]): void {
    for (const a of fleet) {
      this.h.decks.drop(a.id);
      for (const m of [a.furled, a.set, a.plank]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    }
  }
}
