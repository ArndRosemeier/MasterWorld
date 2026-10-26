/**
 * The regions the VGM opens as the hero walks (plan 5.5, B1), in the game: asks the frontier (vgm/frontier.ts)
 * a few times a second for the next region and logs it, and draws the places in them (world/sites.ts)
 * once the hero comes within a walk of them, with the town's building shader (nothing new to build).
 * The walker cannot go through them, and trees keep out of their footprints.
 */
import type { Mesh } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { RegionsDef } from '../setting/contract';
import type { DecisionLog, RegionDecision } from '../world/decisions';
import { hitsSolid, layOutSite, type SiteLayout } from '../world/sites';
import type { RegionMap } from '../world/regions';
import { fillOf, keyOf, nextRegion, regionDecisions, regionLine, regionMapOf, type FrontierContext, type RegionData } from '../vgm/frontier';
import { buildingMeshAt } from '../render/materials/building';
import type { Terrain } from '../world/terrain';

/** Places are drawn once the hero is this near (m), and let go again beyond `DROP`. */
const BUILD = 1600;
const DROP = 2400;
/** Seconds between two asks of the frontier (it opens one region at a time). */
const ASK = 0.5;

interface Site {
  readonly decision: RegionDecision;
  readonly place: NonNullable<ReturnType<typeof fillOf>>['place'];
  layout: SiteLayout | null;
  mesh: Mesh | null;
}

export interface RegionSitesHost {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly regions: RegionsDef;
  readonly seed: number;
  readonly home: { readonly x: number; readonly z: number };
}

export class RegionSites {
  private map: RegionMap<RegionData>;
  private seen = 0;
  private readonly sites: Site[] = [];
  private clock = 0;
  private last: { x: number; z: number } | null = null;
  /** The way the hero has been going lately (smoothed), for what lies ahead. */
  private heading = { x: 0, z: 0 };

  constructor(private readonly host: RegionSitesHost, log: DecisionLog) {
    this.map = regionMapOf([], host.regions.country);
    this.sync(log);
  }

  /** Regions opened so far. */
  get regionCount(): number { return this.seen; }

  /** The open regions (for the map and the debug console). */
  get openMap(): RegionMap<RegionData> { return this.map; }

  /** Takes in the regions the log opened since the last call (a loaded save's too). */
  sync(log: DecisionLog): void {
    const all = regionDecisions(log);
    for (const d of all.slice(this.seen)) {
      this.map.open(keyOf(d), { fill: d.fill, decision: d.id }, () => ({ fill: this.host.regions.country, decision: d.id }));
      const place = fillOf(d, this.host.regions)?.place ?? 'none';
      if (d.site && place !== 'none') this.sites.push({ decision: d, place, layout: null, mesh: null });
    }
    this.seen = all.length;
  }

  /**
   * Every frame out on the land (`dt`): the hero's way is followed, the frontier asked now and then (a new
   * region is returned for the log), and the places near the hero drawn (one a frame), far ones let go.
   */
  heroAt(dt: number, hero: { x: number; z: number }, ask: (() => Omit<FrontierContext, 'terrain' | 'regions' | 'home' | 'hero' | 'heading' | 'map' | 'seed'>) | null): RegionDecision | null {
    if (this.last) {
      const dx = hero.x - this.last.x, dz = hero.z - this.last.z, k = Math.min(1, dt * 0.5);
      // A jump (a teleport, a load) is no heading.
      if (Math.hypot(dx, dz) < 50) { this.heading.x += (dx - this.heading.x) * k; this.heading.z += (dz - this.heading.z) * k; }
    }
    this.last = { x: hero.x, z: hero.z };
    this.drawNear(hero);
    this.clock += dt;
    if (!ask || this.clock < ASK) return null;
    this.clock = 0;
    const moving = Math.hypot(this.heading.x, this.heading.z) > dt * 0.3;
    const h = this.host;
    const d = nextRegion({ ...ask(), seed: h.seed, terrain: h.terrain, regions: h.regions, home: h.home, hero, heading: moving ? this.heading : null, map: this.map });
    if (d) console.info(`[vgm] region ${regionLine(d, h.regions, h.home)}`);
    return d;
  }

  private drawNear(hero: { x: number; z: number }): void {
    let built = false;
    for (const s of this.sites) {
      const site = s.decision.site!, d = Math.hypot(site.x - hero.x, site.z - hero.z);
      if (s.mesh && d > DROP) {
        this.host.stage.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh = null;
      } else if (!s.mesh && !built && d < BUILD) {
        built = true;
        s.layout ??= layOutSite(s.decision, s.place, (x, z) => this.host.terrain.height(x, z));
        if (!s.layout) continue;
        const [x, y, z] = s.layout.origin;
        s.mesh = buildingMeshAt(s.layout.mesh, x, y, z, `${s.place} ${s.decision.id}`);
        void this.host.stage.add(s.mesh);
      }
    }
  }

  /** Is a body of radius `r` at (x, z) inside a place's houses, tents, walls or mounds? */
  standsIn(x: number, z: number, r: number): boolean {
    for (const s of this.sites) {
      const site = s.decision.site!;
      if (!s.layout || Math.abs(x - site.x) > site.r + r + 5 || Math.abs(z - site.z) > site.r + r + 5) continue;
      if (hitsSolid(s.layout.solids, x, z, r)) return true;
    }
    return false;
  }

  /** Does a point lie in a place's footprint (no tree grows there)? */
  cleared(x: number, z: number): boolean {
    for (const s of this.sites) {
      const site = s.decision.site!;
      if ((x - site.x) ** 2 + (z - site.z) ** 2 < site.r * site.r) return true;
    }
    return false;
  }

  /** The HUD's part: regions open, places drawn. */
  get status(): string {
    return `regions ${this.seen} (${this.sites.filter((s) => s.mesh).length} places drawn)`;
  }
}
