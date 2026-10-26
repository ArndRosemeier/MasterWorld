/**
 * The hamlets and villages the VGM founds as the hero walks (plan B3), in the game: each is a town of its
 * size from the one planner (AG settlement planTown), planned in a terrain worker and drawn like the
 * start town (render/town/TownView.ts, the building shader: nothing new compiles). The terrain shader's
 * town masks (streets, yards, fields) move to the settlement the hero is nearest.
 */
import type { Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { RegionDecision } from '../world/decisions';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import type { TerrainJobs } from '../workers/pool';
import type { RoadWork } from './roads';
import { TownView } from '../render/town/TownView';
import { moveTownMasks, townMaskSize } from '../render/materials/townGround';

export interface SettlementsHost {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly land: TerrainJobs;
  readonly roads: RoadWork;
  /** The start town's id (drawn, walked and masked by the game itself), if there is one. */
  readonly home: string | null;
  /** Whether the town masks may move (none without a start town: there is no texture to move into). */
  readonly masks: boolean;
}

/** Seconds between two looks for the nearest settlement. */
const LOOK = 1;

export class Settlements {
  private readonly views = new Map<string, TownView>();
  /** The town whose masks the terrain shader reads, and one on its way in. */
  private masked: string | null;
  private moving = false;
  private clock = 0;

  constructor(private readonly h: SettlementsHost) {
    this.masked = h.home;
  }

  /** The settlements standing already (a loaded game's, founded before the views existed): drawn. */
  async standing(cam: Vector3): Promise<void> {
    await Promise.all(this.others().map((t) => this.raise(t.decision.id, cam, false)));
  }

  /** A hamlet or village founded while playing (already in the log): planned in a worker, then drawn. */
  async found(d: RegionDecision, cam: Vector3): Promise<void> {
    let view: TownView | null = null;
    await this.h.roads.found(d, async () => {
      view = new TownView(this.h.stage, this.h.land);
      return view.build(d.id, cam, true);
    });
    if (view) this.views.set(d.id, view);
  }

  private async raise(id: string, cam: Vector3, plan: boolean): Promise<void> {
    if (this.views.has(id)) return;
    const view = new TownView(this.h.stage, this.h.land);
    this.views.set(id, view);
    await view.build(id, cam, plan);
  }

  /** The towns besides the start's. */
  private others(): readonly Town[] {
    return this.h.terrain.towns.filter((t) => t.decision.id !== this.h.home);
  }

  /** Each frame: near or far meshes, and now and then the masks move to the nearest settlement. */
  tick(dt: number, cam: Vector3): void {
    for (const v of this.views.values()) v.update(cam);
    if ((this.clock += dt) < LOOK || !this.h.masks || this.moving) return;
    this.clock = 0;
    let best: Town | null = null, low = Infinity;
    for (const t of this.h.terrain.towns) {
      if (t.decision.id !== this.h.home && !this.views.has(t.decision.id)) continue;
      const d = Math.hypot(cam.x - t.decision.x, cam.z - t.decision.z) - t.decision.radius;
      if (d < low) { low = d; best = t; }
    }
    if (!best || best.decision.id === this.masked) return;
    const t = best, [w, h] = townMaskSize();
    this.moving = true;
    void this.h.land.townMask(t.decision.id, w, h).then((data) => {
      moveTownMasks(t.x0, t.z0, data);
      this.masked = t.decision.id;
    }).finally(() => { this.moving = false; });
  }

  /** Does a body of radius `r` at (x, z) touch a settlement's walls or fences? */
  solid(x: number, z: number, r: number): boolean {
    for (const t of this.others()) if (t.solid(x, z, r)) return true;
    return false;
  }

  /** The HUD's part. */
  get tally(): string {
    return `settlements ${this.views.size}`;
  }
}
