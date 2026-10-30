/**
 * Bridges where roads and towns' streets cross brooks (world/bridges.ts), drawn round the hero in the town's building shader
 * (no compiles of their own). Found again as the hero moves on, a road is laid or a brook tile arrives:
 * only where the brooks are known here (BrookPrefetch), so finding them never traces a tile on the main thread.
 * Their decks are floors the hero walks on (`deck`).
 */
import { Group, type Mesh } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { Terrain } from '../world/terrain';
import { bridgeMesh, bridgeSideAt, bridgesNear, deckAt, townBridges, type Bridge } from '../world/bridges';
import { buildingMeshAt } from './materials/building';

/** Bridges within this of the hero are drawn, m; they go again past FORGET. */
const REACH = 1500, FORGET = 2200;
/** Looked for again once the hero has moved this far, m. */
const MOVE = 150;

export class BridgeView {
  readonly group = new Group();
  private readonly drawn = new Map<string, { mesh: Mesh; x: number; z: number; b: Bridge }>();
  private lastX = Infinity;
  private lastZ = Infinity;
  private known = '';
  private adding: Promise<void> | null = null;
  /** Each town's bridges, found once its brooks are known (again when a road is laid: one may continue a road out). */
  private readonly byTown = new Map<string, Bridge[]>();
  private townsRoads = -1;

  constructor(private readonly stage: Stage, private readonly terrain: Terrain) {}

  /** Every bridge round (x, z) whose brooks are known here: on the roads and on the towns' streets. */
  around(x: number, z: number, reach: number): Bridge[] {
    const t = this.terrain, hydro = t.hydro, ready = (px: number, pz: number) => hydro.hasBrooks(px, pz);
    if (t.roads.roads.length !== this.townsRoads) { this.byTown.clear(); this.townsRoads = t.roads.roads.length; }
    const out = bridgesNear(t.roads, hydro, x, z, reach, ready, t);
    for (const town of t.towns) {
      const d = town.decision;
      if (Math.hypot(d.x - x, d.z - z) > reach + d.radius * 4) continue;
      let bs = this.byTown.get(d.id);
      if (!bs) {
        const found = townBridges(town, t.roads, hydro, (px, pz) => t.height(px, pz), ready);
        if (!found) continue;
        this.byTown.set(d.id, (bs = found));
      }
      out.push(...bs.filter((b) => Math.hypot(b.x - x, b.z - z) < reach));
    }
    return out;
  }

  /** The bridges drawn now (shots and checks). */
  get bridges(): Bridge[] { return [...this.drawn.values()].map((d) => d.b); }

  /** The top of a bridge's deck at (x, z), or null off every bridge (the hero's floor). */
  deck(x: number, z: number): number | null {
    for (const d of this.drawn.values()) {
      if (Math.abs(d.x - x) > 40 || Math.abs(d.z - z) > 40) continue;
      const y = deckAt(d.b, x, z);
      if (y !== null) return y;
    }
    return null;
  }

  /** The ground at (x, z) with the bridges on it: a bridge's deck where that is higher than the land (folk and beasts cross on it). */
  ground(x: number, z: number, land: number): number {
    const y = this.deck(x, z);
    return y !== null && y > land ? y : land;
  }

  /** Whether a body of radius `r` (feet at `feet`, or anywhere) runs into a bridge's parapets or walls. */
  side(x: number, z: number, r: number, feet?: number): boolean {
    for (const d of this.drawn.values()) {
      if (Math.abs(d.x - x) > 40 || Math.abs(d.z - z) > 40) continue;
      if (bridgeSideAt(d.b, x, z, r, feet)) return true;
    }
    return false;
  }

  /** Each frame or so: the bridges round (x, z). */
  lookAround(x: number, z: number): void {
    const hydro = this.terrain.hydro, known = `${this.terrain.roads.roads.length},${hydro.brookTileCount}`;
    if (known === this.known && Math.hypot(x - this.lastX, z - this.lastZ) < MOVE) return;
    this.known = known; this.lastX = x; this.lastZ = z;
    for (const [id, d] of this.drawn) {
      if (Math.hypot(d.x - x, d.z - z) < FORGET) continue;
      d.mesh.removeFromParent(); d.mesh.geometry.dispose(); this.drawn.delete(id);
    }
    const all = this.around(x, z, REACH), ids = new Set(all.map((b) => b.id));
    // A bridge gone (a road laid on from a town's road out that ended in a brook takes over its bridge).
    for (const [id, d] of this.drawn) {
      if (ids.has(id) || Math.hypot(d.x - x, d.z - z) > REACH * 0.9) continue;
      d.mesh.removeFromParent(); d.mesh.geometry.dispose(); this.drawn.delete(id);
    }
    const fresh = all.filter((b) => !this.drawn.has(b.id));
    if (!fresh.length) return;
    if (!this.group.parent && !this.adding) this.adding = this.stage.add(this.group);
    for (const b of fresh) {
      const mesh = buildingMeshAt(bridgeMesh(b), b.x, 0, b.z, `bridge ${b.id}`);
      this.drawn.set(b.id, { mesh, x: b.x, z: b.z, b });
      // The building shader is the town's, built at load; prepared all the same, so nothing compiles on the render path.
      void this.stage.prepare(mesh).then(() => { if (this.drawn.get(b.id)?.mesh === mesh) this.group.add(mesh); });
    }
  }
}
