/**
 * Roads in the running game (plan 7): road decisions reach the main thread's land and every worker, the
 * terrain shader's road mask follows the camera, and a road laid while playing (the VGM linking a new
 * place) has the land, plants, trunks and masks near it built again. A place out on the land (a tower, a
 * cave, a barrow, a hamlet or camp of an opened region) clears its trees the same way.
 */
import type { Vector3 } from 'three/webgpu';
import type { Decision, DungeonDecision, RegionDecision, RoadDecision } from '../world/decisions';
import type { Terrain } from '../world/terrain';
import type { Trunks } from '../world/trunks';
import type { TerrainJobs, WorldJobs } from '../workers/pool';
import { FollowedMask } from '../render/followedMask';
import { ROAD } from '../render/materials/roads';
import type { TerrainView } from '../render/terrain/TerrainView';
import type { FloraView } from '../render/flora/FloraView';
import type { GrassView } from '../render/grass/GrassView';

/** What is built from the land near a road, to be built again when one is laid. */
export interface RoadViews {
  ground: TerrainView;
  flora: FloraView;
  grass: GrassView | null;
  trunks: Trunks;
}

export class RoadWork {
  /** The road mask round the camera (rebaked 600 m before its edge comes into the drawn ground). */
  readonly mask: FollowedMask;
  private views: RoadViews | null = null;
  /** The places whose clearings the workers have heard of. */
  private readonly sent = new Set<string>();

  constructor(private readonly terrain: Terrain, private readonly world: WorldJobs, private readonly land: TerrainJobs) {
    this.mask = new FollowedMask(ROAD.mask, (x0, z0, side, res) => world.roadMask(x0, z0, side, res), ROAD.mask.side / 2 - 600, 64);
  }

  /**
   * The roads of a loaded game or of the start (decided before anything was built from the land): to the
   * main thread's land and every worker. Jobs sent after this see them.
   */
  start(ds: readonly Decision[]): Promise<unknown> {
    const roads = ds.filter((d): d is RoadDecision => d.kind === 'road');
    this.terrain.settleMore(roads);
    if (!roads.length) return Promise.resolve();
    return Promise.all([this.world.decisions(roads), this.land.decisions(roads)]);
  }

  /** The views that are built from the land; from now on a laid road has them built again near it. */
  rebuilds(views: RoadViews): void {
    this.views = views;
  }

  /** Lay a road decided while playing (already in the log): the land changes, and what stood near the road is built anew. */
  async lay(d: RoadDecision): Promise<void> {
    this.terrain.addRoad(d);
    await Promise.all([this.world.decisions([d]), this.land.decisions([d])]);
    const ids = new Set([d.id]);
    const touches = (x0: number, z0: number, x1: number, z1: number) => this.terrain.roads.passesNear(x0, z0, x1, z1, ids);
    this.views?.ground.refresh(touches);
    this.views?.flora.refresh(touches);
    this.views?.trunks.forgetOver(touches);
    this.views?.grass?.invalidate();
    this.mask.invalidate();
  }

  /** A place out on the land (already in the log): the trees go from its clearing, and the plants and trunks near it are placed anew. */
  async clear(d: DungeonDecision | RegionDecision): Promise<void> {
    if (this.sent.has(d.id)) return;
    this.sent.add(d.id);
    this.terrain.settleMore([d]);
    const c = this.terrain.clearings.get(d.id);
    if (!c) return;
    await Promise.all([this.world.decisions([d]), this.land.decisions([d])]);
    // Squares that reach the clearing or the edge where the trees come back.
    const reach = c.r + 10;
    const touches = (x0: number, z0: number, x1: number, z1: number) => Math.hypot(Math.max(x0 - c.x, 0, c.x - x1), Math.max(z0 - c.z, 0, c.z - z1)) < reach;
    this.views?.flora.refresh(touches);
    this.views?.trunks.forgetOver(touches);
  }

  /** Each frame: the mask follows the camera. */
  follow(cam: Vector3): void {
    this.mask.follow(cam);
  }
}
