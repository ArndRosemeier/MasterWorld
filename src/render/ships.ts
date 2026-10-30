/**
 * The ships and boats of the harbour towns near the camera (S2, S3): each a mesh of its own, riding the swell
 * where the water is drawn (rising and falling with the waves, pitching and rolling with them, a big ship slower
 * than a boat) and going where the fleet's day puts it (world/fleet.ts): the fishing boats out at dawn under sail and
 * home in the afternoon, the ships at their berths. The building shader draws them, so no new shader compiles.
 */
import { Group, type Mesh, type Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { shipMesh } from '@futuremagic/settlement';
import { buildingMeshAt } from './materials/building';
import { afloatAt, fleetOf, type Vessel } from '../world/fleet';
import type { Town } from '../world/town';

/** Vessels are drawn within this of the camera (m), in detail within DETAIL. */
const SEEN = 1500, DETAIL = 300;
/** How fast a hull follows the waves' tilt (per second): a long keel answers them slowly. */
const FOLLOW = 2.5;

interface Afloat {
  readonly v: Vessel;
  /** Its meshes (sails furled, and set for a boat that goes out), built when first near. */
  furled: Mesh | null;
  set: Mesh | null;
  pitch: number;
  roll: number;
}

export interface ShipsHost {
  readonly stage: Stage;
  /** The harbour towns standing on the land so far. */
  readonly harbours: () => readonly Town[];
  /** The water's surface as drawn at a point, waves included (null: none there, or not drawn). */
  readonly surface: (x: number, z: number) => number | null;
  /** Water depth at a point (0 on land). */
  readonly water: (x: number, z: number) => number;
}

export class ShipsView {
  private readonly group = new Group();
  private readonly fleets = new Map<string, Afloat[]>();
  private added = false;

  constructor(private readonly h: ShipsHost) {}

  /** Every frame: the vessels near `cam` where the hour puts them, on the waves. One mesh is built per frame at most. */
  float(cam: Vector3, hours: number, dt: number): void {
    if (!this.added) { this.added = true; void this.h.stage.add(this.group); }
    let built = false;
    for (const t of this.h.harbours()) {
      const h = t.plan.harbour;
      if (!h) continue;
      const dx = t.decision.x - cam.x, dz = t.decision.z - cam.z, near = dx * dx + dz * dz < (SEEN + 2500) ** 2;
      let fleet = this.fleets.get(t.decision.id);
      if (!near) { if (fleet) this.drop(t.decision.id, fleet); continue; }
      if (!fleet) { fleet = fleetOf(h, t.decision.seed ?? 0, this.h.water).map((v) => ({ v, furled: null, set: null, pitch: 0, roll: 0 })); this.fleets.set(t.decision.id, fleet); }
      for (const a of fleet) {
        const at = afloatAt(a.v, hours), d = Math.hypot(at.x - cam.x, at.z - cam.z);
        const want = d < SEEN ? (at.sailing ? 'set' : 'furled') : null;
        if (want && !a[want] && !built) { a[want] = this.build(a.v, want, d < DETAIL); built = true; }
        for (const k of ['furled', 'set'] as const) { const m = a[k]; if (m) m.visible = want === k; }
        const m = want ? a[want] : null;
        if (m) this.ride(a, m, at, dt);
      }
    }
  }

  private build(v: Vessel, sails: 'furled' | 'set', detail: boolean): Mesh {
    const m = buildingMeshAt(shipMesh(v.mooring.plan, 0, 0, 1, 0, 0, [0, 0, 0], sails, detail), 0, 0, 0, 'ship');
    m.rotation.order = 'YZX';
    this.group.add(m);
    return m;
  }

  /** On the waves at its place: up and down with the surface under its middle, its tilt following bow and side. */
  private ride(a: Afloat, m: Mesh, at: { x: number; z: number; ux: number; uz: number }, dt: number): void {
    const p = a.v.mooring.plan, L = p.length * 0.35, B = p.beam * 0.4;
    const sea = (x: number, z: number) => this.h.surface(x, z) ?? 0;
    const bow = sea(at.x + at.ux * L, at.z + at.uz * L), stern = sea(at.x - at.ux * L, at.z - at.uz * L);
    const port = sea(at.x - at.uz * B, at.z + at.ux * B), star = sea(at.x + at.uz * B, at.z - at.ux * B);
    const k = Math.min(1, dt * FOLLOW);
    a.pitch += (Math.atan2(bow - stern, 2 * L) - a.pitch) * k;
    a.roll += (Math.atan2(port - star, 2 * B) * 0.7 - a.roll) * k;
    m.position.set(at.x, (bow + stern + port + star) / 4, at.z);
    // Local +a is its bow, +b its port side: turned about y to its heading, then pitched (about b) and rolled.
    m.rotation.set(-a.roll, -Math.atan2(at.uz, at.ux), a.pitch);
    m.updateMatrix();
  }

  private drop(id: string, fleet: Afloat[]): void {
    for (const a of fleet) for (const m of [a.furled, a.set]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    this.fleets.delete(id);
  }
}
