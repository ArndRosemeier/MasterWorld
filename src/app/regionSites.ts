/**
 * The regions the VGM opens as the hero walks (plan 5.5, B1), in the game: asks the frontier (vgm/frontier.ts)
 * a few times a second for the next region and logs it, and draws the places in them (world/sites.ts)
 * once the hero comes within a walk of them, with the town's building shader (nothing new to build).
 * The walker cannot go through them, and trees keep out of their footprints. Hamlets and villages are
 * towns of their size: app/settlements.ts draws those. The sights the VGM puts by the hero's way (C9) are
 * drawn the same way, and say what they are when the hero comes upon them. Looking for a region's place and
 * laying a place out take up to a tenth of a second: both are done in workers (`jobs`), off the frame (F2).
 */
import type { Mesh } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { RegionsDef, SightDef } from '../setting/contract';
import { settlementOf, type DecisionLog, type RegionDecision, type SightDecision } from '../world/decisions';
import { SIGHT_R, hitsSolid, layOut, type SiteJob, type SiteLayout } from '../world/sites';
import { sightsOf } from '../vgm/answers';
import type { RegionMap } from '../world/regions';
import { fillOf, keyOf, nextRegion, regionDecisions, regionLine, regionMapOf, wantsRegion, type FrontierAsk, type FrontierContext, type RegionData } from '../vgm/frontier';
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
  readonly job: SiteJob;
  /** Laid out (null: nothing stands there; undefined: not yet, `laying` while a worker lays it out). */
  layout: SiteLayout | null | undefined;
  laying: boolean;
  mesh: Mesh | null;
  /** A sight's words, until the hero has come upon it (null: said, or a region's place), and its decision. */
  sight: SightDef | null;
  readonly decision?: SightDecision;
  /** The hero has stood by it (Discovery is met the first time). */
  found: boolean;
}

/** The hero has come upon a place within this of its edge (m). */
const CAME_UPON = 12;
/** A wreck (S8) is come upon within this of her middle (m: she is some 28 m long), and this high over the bed at most. */
const WRECK_REACH = 10, WRECK_OVER = 7;

export interface RegionSitesHost {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly regions: RegionsDef;
  readonly seed: number;
  readonly home: { readonly x: number; readonly z: number };
  /** The setting's sights (C9). */
  readonly sights?: readonly SightDef[];
  /** The workers that look for the next region and lay places out (none: here, in the frame, as tests do). */
  readonly jobs?: {
    frontier(ask: FrontierAsk): Promise<RegionDecision | null>;
    site(job: SiteJob): Promise<SiteLayout | null>;
  };
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
        this.sites.push({ at: site, label: `${place} ${d.id}`, job: { region: d, place }, layout: undefined, laying: false, mesh: null, sight: null, found: !this.synced });
      }
    }
    this.seen = all.length;
    const sights = sightsOf(log);
    for (const d of sights.slice(this.sightsSeen)) {
      const def = this.host.sights?.find((x) => x.id === d.sight);
      if (!def) continue;
      // A loaded game's sights were come upon before.
      this.sites.push({ at: { x: d.x, z: d.z, r: SIGHT_R }, label: `${d.sight} ${d.id}`, job: { sight: d, shape: def.shape }, layout: undefined, laying: false, mesh: null, sight: this.synced ? def : null, decision: d, found: !this.synced });
    }
    this.sightsSeen = sights.length;
    this.synced = true;
  }

  private synced = false;
  private readonly heightAt = (x: number, z: number) => this.host.terrain.height(x, z);
  /** A frontier ask is out with the workers; the region it found, until the next frame takes it. */
  private asking = false;
  private found: RegionDecision | null = null;

  /**
   * The place the hero at (x, z) has just come upon for the first time (Discovery, C9): a sight with its
   * words and decision, or a region's place (`sight` null); null if none. `id`: the place, for its experience (D58).
   */
  cameUpon(x: number, z: number, y = Infinity): { readonly id: string; readonly sight: SightDef | null; readonly decision?: SightDecision } | null {
    for (const s of this.sites) {
      if (s.found || Math.hypot(s.at.x - x, s.at.z - z) > s.at.r + (s.decision?.sea ? WRECK_REACH : CAME_UPON)) continue;
      // A wreck (S8) is come upon down by her, not swimming over her at the surface.
      if (s.decision?.sea && y > this.host.terrain.height(s.at.x, s.at.z) + WRECK_OVER) continue;
      s.found = true;
      const sight = s.sight;
      s.sight = null;
      return { id: s.label, sight, decision: s.decision };
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
   * region the workers found is returned for the log, a frame or more later), and the places near the hero
   * drawn (one a frame, laid out by a worker first), far ones let go.
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
    const h = this.host, d = this.found;
    this.found = null;
    // Found for the log as it was: a region opened since (a load, a walk to a place) makes it stale.
    if (d && d.id === `region-${this.seen + 1}`) {
      console.info(`[vgm] region ${regionLine(d, h.regions, h.home)}`);
      return d;
    }
    if (!ask || this.clock < ASK || this.asking) return null;
    this.clock = 0;
    const moving = Math.hypot(this.heading.x, this.heading.z) > dt * 0.3;
    const a: FrontierAsk = { ...ask(), home: h.home, hero: { x: hero.x, z: hero.z }, heading: moving ? { ...this.heading } : null };
    if (!wantsRegion(a.log, this.map, a.hero, a.heading)) return null;
    this.asking = true;
    const found = h.jobs ? h.jobs.frontier(a) : Promise.resolve(nextRegion({ ...a, seed: h.seed, terrain: h.terrain, regions: h.regions, map: this.map }));
    void found.then((r) => { this.found = r; }, (e: unknown) => console.warn('the frontier:', e)).finally(() => { this.asking = false; });
    return null;
  }

  private drawNear(hero: { x: number; z: number }): void {
    let built = false;
    for (const s of this.sites) {
      const d = Math.hypot(s.at.x - hero.x, s.at.z - hero.z);
      if (s.mesh && d > DROP) {
        this.host.stage.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh = null;
      } else if (!s.mesh && !built && !s.laying && d < BUILD) {
        built = true;
        if (s.layout === undefined) {
          s.laying = true;
          const laid = this.host.jobs ? this.host.jobs.site(s.job) : Promise.resolve(layOut(s.job, this.heightAt));
          void laid.then((l) => { s.layout = l; }, (e: unknown) => { s.layout = null; console.warn(`laying out ${s.label}:`, e); }).finally(() => { s.laying = false; });
          continue;
        }
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
