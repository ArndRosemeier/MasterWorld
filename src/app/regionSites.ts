/**
 * The regions the VGM opens as the hero walks (plan 5.5, B1), in the game: asks the frontier (vgm/frontier.ts)
 * a few times a second for the next region and logs it, and draws the places in them (world/sites.ts)
 * once the hero comes within a walk of them, with the town's building shader (nothing new to build).
 * The walker cannot go through them, and trees keep out of their footprints. Hamlets and villages are
 * towns of their size: app/settlements.ts draws those. The sights the VGM puts by the hero's way (C9) are
 * drawn the same way, and say what they are when the hero comes upon them.
 */
import type { Mesh } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { RegionsDef, SightDef } from '../setting/contract';
import { settlementOf, type DecisionLog, type RegionDecision, type SightDecision } from '../world/decisions';
import { SIGHT_R, hitsSolid, layOutSight, layOutSite, type SiteLayout } from '../world/sites';
import { sightsOf } from '../vgm/answers';
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
  /** Its middle and reach (m). */
  readonly at: { readonly x: number; readonly z: number; readonly r: number };
  readonly label: string;
  readonly make: () => SiteLayout | null;
  layout: SiteLayout | null;
  mesh: Mesh | null;
  /** A sight's words, until the hero has come upon it (null: said, or a region's place), and its decision. */
  sight: SightDef | null;
  readonly decision?: SightDecision;
  /** The hero has stood by it (Discovery is met the first time). */
  found: boolean;
}

/** The hero has come upon a place within this of its edge (m). */
const CAME_UPON = 12;

export interface RegionSitesHost {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly regions: RegionsDef;
  readonly seed: number;
  readonly home: { readonly x: number; readonly z: number };
  /** The setting's sights (C9). */
  readonly sights?: readonly SightDef[];
}

export class RegionSites {
  private map: RegionMap<RegionData>;
  private seen = 0;
  private sightsSeen = 0;
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
      // Hamlets and villages are towns of their size (app/settlements.ts draws them).
      const site = d.site;
      if (site && place !== 'none' && !settlementOf(d, this.host.regions.fills)) {
        this.sites.push({ at: site, label: `${place} ${d.id}`, make: () => layOutSite(d, place, this.heightAt), layout: null, mesh: null, sight: null, found: !this.synced });
      }
    }
    this.seen = all.length;
    const sights = sightsOf(log);
    for (const d of sights.slice(this.sightsSeen)) {
      const def = this.host.sights?.find((x) => x.id === d.sight);
      if (!def) continue;
      // A loaded game's sights were come upon before.
      this.sites.push({ at: { x: d.x, z: d.z, r: SIGHT_R }, label: `${d.sight} ${d.id}`, make: () => layOutSight(d, def.shape, this.heightAt), layout: null, mesh: null, sight: this.synced ? def : null, decision: d, found: !this.synced });
    }
    this.sightsSeen = sights.length;
    this.synced = true;
  }

  private synced = false;
  private readonly heightAt = (x: number, z: number) => this.host.terrain.height(x, z);

  /**
   * The place the hero at (x, z) has just come upon for the first time (Discovery, C9): a sight with its
   * words and decision, or a region's place (`sight` null); null if none.
   */
  cameUpon(x: number, z: number): { readonly sight: SightDef | null; readonly decision?: SightDecision } | null {
    for (const s of this.sites) {
      if (s.found || Math.hypot(s.at.x - x, s.at.z - z) > s.at.r + CAME_UPON) continue;
      s.found = true;
      const sight = s.sight;
      s.sight = null;
      return { sight, decision: s.decision };
    }
    return null;
  }

  /** A point `metres` ahead of the hero on the way they have been going (none: they stand still). */
  ahead(metres: number): { x: number; z: number } | null {
    const h = this.heading, n = Math.hypot(h.x, h.z);
    return this.last && n > 1e-3 ? { x: this.last.x + (h.x / n) * metres, z: this.last.z + (h.z / n) * metres } : null;
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
      const d = Math.hypot(s.at.x - hero.x, s.at.z - hero.z);
      if (s.mesh && d > DROP) {
        this.host.stage.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh = null;
      } else if (!s.mesh && !built && d < BUILD) {
        built = true;
        s.layout ??= s.make();
        if (!s.layout) continue;
        const [x, y, z] = s.layout.origin;
        s.mesh = buildingMeshAt(s.layout.mesh, x, y, z, s.label);
        void this.host.stage.add(s.mesh);
      }
    }
  }

  /** Is a body of radius `r` at (x, z) inside a place's houses, tents, walls or mounds? */
  standsIn(x: number, z: number, r: number): boolean {
    for (const s of this.sites) {
      const site = s.at;
      if (!s.layout || Math.abs(x - site.x) > site.r + r + 5 || Math.abs(z - site.z) > site.r + r + 5) continue;
      if (hitsSolid(s.layout.solids, x, z, r)) return true;
    }
    return false;
  }

  /** The HUD's part: regions open, places drawn. */
  get status(): string {
    return `regions ${this.seen} (${this.sites.filter((s) => s.mesh).length} places drawn)`;
  }
}
