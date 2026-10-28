/**
 * Every cellar the VGM has promised under the town's houses (plan 4.2, 8), and every barrow, cave and
 * ruined tower out on the land (a cellar's making with its own lore and shape; its piece stands on the
 * land, a mound, a crag with a mouth, a keep, and walking into its doorway goes in), played one at a time. A cellar
 * is outlined from its decision when it is promised (cheap), and built (its meshes, its dwellers' den and
 * bodies, its fight) once the hero steps into the house above, so it stands ready by the time they reach
 * the hatch; the first one is built while the game loads. When new dwellers move into a cleared cellar
 * (a move-in, plan 8.1) its den, bodies and fight are made anew; the rooms and the doors the hero opened
 * stay. What each cellar's visit changed goes into the save by promise id.
 */
import type { Mesh, Object3D, PerspectiveCamera, PointLight, WebGPURenderer } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { TownBuilding } from '@futuremagic/settlement';
import { deriveSeed } from '@futuremagic/core';
import type { Character } from '../game/character';
import { Delve, type DelveSave } from '../game/delve';
import { CellarView } from '../render/dungeon/CellarView';
import type { WarmLights } from '../render/warmLights';
import { CreatureView } from '../render/dungeon/CreatureView';
import type { SkyView } from '../render/sky';
import type { SettingModule } from '../setting/contract';
import type { Journal } from '../talk/journal';
import type { Director } from '../vgm/director';
import { buildingMeshAt } from '../render/materials/building';
import { houseOf, loreOf, placeOf } from '../vgm/dungeons';
import { occupationOf } from '../vgm/leads';
import type { DecisionLog, DungeonDecision, MoveInDecision, RetakeDecision } from '../world/decisions';
import { barrowMesh, inBarrowShape, WAY_DOWN } from '../world/dungeon/barrowMesh';
import { CaveSpace, caveField, caveShell } from '../world/dungeon/caveRock';
import { MOUTH_WAY_DOWN, mouthOnLand, type CaveMouth } from '../world/dungeon/caveMouth';
import { inWalkRaster } from '../world/dungeon/rockMesh';
import { groundIn, onLand, inFrame, type Site as LandSite } from '../world/dungeon/site';
import { inTowerShape, TOWER_WAY_IN, towerMesh, towerSize } from '../world/dungeon/towerMesh';
import { CELL } from '../world/dungeon/cellar';
import type { DungeonLayout } from '@futuremagic/dungeon';
import type { BuildingMesh } from '@futuremagic/settlement';
import { moveIn, occupantId, outlineCellar, type Cellar, type DungeonPlace } from '../world/dungeon/cellar';
import { cellarDanger, hoardsOf } from '../world/dungeon/treasure';
import { fill } from '../talk/folk';
import { cap } from '../talk/townTalk';
import { rewardFor } from '../game/reward';
import { houseKey, type Town } from '../world/town';
import { Encounter, type Arena, type FightCue, type FightHost } from './encounter';
import { CellarVisit } from './cellarVisit';
import type { FightHud } from './fightHud';
import type { Notes } from './notes';
import type { Player } from './player';
import { WalkTo } from './walkTo';
import type { CellarDiff } from './saveGame';

export interface CellarsHost {
  readonly stage: Stage;
  readonly renderer: WebGPURenderer;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  readonly player: Player;
  readonly lantern: PointLight;
  /** Firelight: the torches while down here. */
  readonly warm: WarmLights;
  readonly sky: SkyView;
  readonly notes: Notes;
  readonly setting: SettingModule;
  readonly character: Character;
  readonly seed: number;
  readonly director: Director;
  readonly journal: Journal;
  readonly hud: FightHud;
  readonly fight: FightHost;
  /** After going down or coming up (the game autosaves). */
  swapped(): void;
  /** A fight's sounds and music. */
  cue(c: FightCue): void;
  /** `?dweller=`: who lives in every cellar (for looking at them). */
  readonly dweller: string | null;
  /** The land's height (a barrow, a cave's crag, a tower stand on it). */
  ground(x: number, z: number): number;
  /** The terrain workers, for a cave's rock and mouth (none: built here, a moment's stall). */
  readonly jobs?: {
    caveRock(layout: DungeonLayout, cave: number): Promise<{ readonly field: import('../world/dungeon/caveRock').CaveField; readonly shell: BuildingMesh }>;
    caveMouth(site: LandSite, cave: number): Promise<CaveMouth>;
  };
  /** A place out on the land opens: the trees round it go (the land's views are built again there). */
  cleared?(d: DungeonDecision): void;
  /** Down (true) or up again: the land above leaves the frame meanwhile, all but `keep` (the cellar and its dwellers). */
  depth(below: boolean, keep: readonly Object3D[]): void;
}

/** A place's piece on the land (a barrow's mound, a cave's crag, a tower): where it stands, its mesh, its way in. */
interface Mound extends LandSite {
  /** Its mesh, once made (a cave's crag is made by a worker). */
  mesh: Mesh | null;
  /** Is a body of radius `r` at (x, z) of its own frame in its way? */
  inShape: (x: number, z: number, r: number) => boolean;
  /** Where in its doorway the way goes in (its frame). */
  readonly way: { readonly x: number; readonly z: number };
  /** Where the hero comes back out (its frame), facing away from it. */
  readonly out: number;
  /** Seconds before walking into the doorway goes in again (after coming out). */
  cool: number;
}

/** A place on the land is built (rooms, dwellers) once the hero is this near, metres. */
const BARROW_NEAR = 250;
/** How far past its way point the hero walks on into a place's doorway before going in, metres. */
const WALK_IN = 0.9;
/** How far a place's piece reaches from its site, metres (for quick tests). */
const MOUND_REACH = 24;

/** One cellar: its promise and house; its parts once built. */
interface Site {
  readonly decision: DungeonDecision;
  /** A cellar's house above; a barrow's household who knows of it. */
  readonly house: TownBuilding;
  readonly place: DungeonPlace;
  /** A place's piece on the land (none: a cellar, reached through its house). */
  readonly mound: Mound | null;
  /** As outlined for its first dwellers (the rooms never change). */
  readonly first: Cellar;
  /** Who lives there now. */
  cellar: Cellar;
  built: Promise<Built> | null;
  ready: Built | null;
}

interface Built {
  readonly view: CellarView;
  readonly visit: CellarVisit;
  delve: Delve;
  creatures: CreatureView;
  fight: Encounter;
}

export class Cellars {
  private readonly sites = new Map<string, Site>();
  /** Houses with a cellar (by houseKey: every town's), and the way down (the rooms read it). */
  readonly down = new Map<string, () => Promise<CellarVisit>>();
  private log: DecisionLog = [];
  /** Places the hero has been down in (Discovery is met the first time). */
  private readonly found = new Set<string>();

  constructor(private readonly host: CellarsHost, private readonly towns: readonly Town[], private readonly saved: Readonly<Record<string, CellarDiff>> = {}) {}

  /** The promises in the log (call again as it grows): new cellars get a hatch, moved-into ones new dwellers. */
  sync(log: DecisionLog): void {
    this.log = log;
    for (const d of log) {
      if (d.kind === 'dungeon' && !this.sites.has(d.id)) this.open(d);
      else if (d.kind === 'move-in' || d.kind === 'retake') this.moved(d);
    }
  }

  /** The cellar the hero is down in, if any. */
  get downIn(): CellarVisit | null {
    for (const s of this.sites.values()) if (s.ready?.visit.inside) return s.ready.visit;
    return null;
  }

  /** The fight down there, else none. */
  get fightBelow(): Encounter | null {
    for (const s of this.sites.values()) if (s.ready?.visit.inside) return s.ready.fight;
    return null;
  }

  /** A promise's cellar (by the dungeon's id), built now if it is not yet. */
  async build(id: string): Promise<CellarVisit | null> {
    const s = this.sites.get(id);
    if (!s) return null;
    return (await this.ensure(s)).visit;
  }

  /** The hero is in this building's room: its cellar, if it has one, gets ready below. */
  nearHouse(town: string, building: number): void {
    for (const s of this.sites.values()) if (!s.mound && s.decision.town === town && s.house.id === building && !s.built) void this.ensure(s);
  }

  /**
   * Out on the land, every frame (`dt`): barrows near the hero get built, and walking into one's passage
   * goes down.
   */
  approach(dt: number, x: number, z: number): void {
    for (const s of this.sites.values()) {
      const m = s.mound;
      if (!m) continue;
      m.cool = Math.max(0, m.cool - dt);
      if (Math.hypot(x - m.x, z - m.z) > BARROW_NEAR) continue;
      if (!s.built) void this.ensure(s);
      const [wx, wz] = onLand(m, m.way.x, m.way.z);
      if (s.ready && !s.ready.visit.inside && m.cool === 0 && !this.host.player.puppet && Math.hypot(x - wx, z - wz) < 0.9) {
        m.cool = 3;
        // On into the dark of the doorway, seen from out in front; then down (the scene let go once the screen is dark).
        const visit = s.ready.visit, p = this.host.player, [ix, iz] = onLand(m, m.way.x, m.way.z - WALK_IN);
        const [ox, oz] = onLand(m, 0, m.out), front = [Math.sin(m.yaw), Math.cos(m.yaw)] as const;
        p.puppet = new WalkTo(p.walker.pos, { x: ix, z: iz }, null, () => void visit.enter(false, undefined, () => { p.puppet = null; }), { round: { x: ox, y: this.host.ground(ox, oz), z: oz }, front });
      }
    }
  }

  /** Is a body of radius `r` at (x, z) on the land inside a place's piece (a barrow's mound, a crag, a tower's walls)? */
  solid(x: number, z: number, r: number): boolean {
    for (const s of this.sites.values()) {
      const m = s.mound;
      if (!m || Math.abs(x - m.x) > MOUND_REACH || Math.abs(z - m.z) > MOUND_REACH) continue;
      const [fx, fz] = inFrame(m, x, z);
      if (m.inShape(fx, fz, r)) return true;
    }
    return false;
  }

  /** Is this dungeon the one the hero is down in? */
  isInside(id: string): boolean {
    return !!this.sites.get(id)?.ready?.visit.inside;
  }

  step(dt: number): void {
    for (const s of this.sites.values()) s.ready?.visit.update(dt);
  }

  /** Every built cellar's fight (app/encounter.ts plays the one the hero is down in; the others keep their promise once quiet). */
  get encounters(): Encounter[] {
    const out: Encounter[] = [];
    for (const s of this.sites.values()) if (s.ready && !s.ready.fight.retired) out.push(s.ready.fight);
    return out;
  }

  /** Promises kept since loading (their households were told). */
  private readonly kept = new Set<string>();

  /**
   * A promise kept: its household was told the place is safe (`id`: the dungeon's, or the move-in's).
   * What they pay and how they thank the hero; null for a promise with no place here.
   */
  keep(id: string): { readonly coins: number; thanks(coins: string): string } | null {
    for (const s of this.sites.values()) {
      if (occupantId(s.cellar) !== id) continue;
      this.kept.add(id);
      if (s.ready) s.ready.fight.paid = true;
      const words = loreOf(this.host.setting, s.decision.template).words ?? CELLAR_WORDS;
      return { coins: rewardFor(s.cellar, this.host.setting.creatures), thanks: (coins) => cap(fill(words.thanks, { place: s.cellar.house, coins })) };
    }
    return null;
  }

  /** What each cellar's visit changed, by promise id (cellars not built since loading keep what the save had). */
  diffs(): Record<string, CellarDiff> {
    const out: Record<string, CellarDiff> = { ...this.saved };
    for (const id of this.kept) out[id] = { ...(out[id] ?? { open: [], keys: [], read: [] }), paid: true };
    for (const s of this.sites.values()) {
      const b = s.ready;
      if (!b) continue;
      const space = b.visit.diff, own = occupantId(s.cellar);
      const tally = { delve: b.fight.delve.tally(), paid: b.fight.paid };
      if (own === s.decision.id) out[own] = { ...space, ...tally };
      else {
        out[s.decision.id] = { ...(out[s.decision.id] ?? {}), ...space };
        out[own] = { open: [], keys: [], read: [], ...tally };
      }
    }
    return out;
  }

  /** The HUD's line for the cellar the hero is in. */
  get hudText(): string { return this.downIn?.summary ?? ''; }

  private open(d: DungeonDecision): void {
    const house = houseOf(d, this.towns), place = placeOf(d, this.towns, this.host.setting.dungeons);
    if (!house || !place) return;
    const lore = loreOf(this.host.setting, d.template);
    const only = this.host.dweller ? lore.dwellers.filter((w) => w.id === this.host.dweller) : [];
    const first = only.length ? outlineCellar({ ...d, danger: undefined }, place, { ...lore, dwellers: only }) : outlineCellar(d, place, lore);
    const m = occupationOf(this.log, d.id);
    const mound = d.site ? this.heap(d, d.site, first.layout) : null;
    if (d.site) this.host.cleared?.(d);
    const s: Site = { decision: d, house, place, mound, first, cellar: m ? moveIn(first, m, place, lore) : first, built: null, ready: null };
    this.sites.set(d.id, s);
    if (mound) return;
    this.down.set(houseKey(d.town, house.id), async () => (await this.ensure(s)).visit);
  }

  /**
   * A place's piece on the land at its site (the town's building shader: nothing new to build): a barrow's
   * mound and passage, a cave's crag and mouth (made by a worker), a tower's keep sized to its rooms.
   */
  private heap(d: DungeonDecision, site: LandSite, layout: DungeonLayout): Mound {
    const h = this.host, y = h.ground(site.x, site.z);
    // The land in the piece's own frame (its doorway at 0), so what stands on it is set on the ground.
    const land = groundIn(site, (x, z) => h.ground(x, z), y);
    const put = (mesh: BuildingMesh, sink: number): Mesh => {
      const m = buildingMeshAt(mesh, site.x, y - sink, site.z, d.template, site.yaw);
      void h.stage.add(m);
      return m;
    };
    // What stands over it is its kind's shell (C6c: the form says which builder, not the kind's name).
    const shell = loreOf(h.setting, d.template).form.shell;
    if (shell === 'mouth') {
      const seed = deriveSeed(d.seed, 'cave');
      const mound: Mound = { ...site, mesh: null, inShape: () => false, way: MOUTH_WAY_DOWN, out: 3, cool: 0 };
      void (h.jobs ? h.jobs.caveMouth(site, seed) : Promise.resolve(mouthOnLand((x, z) => h.ground(x, z), site, seed))).then((mouth) => {
        mound.mesh = put(mouth.mesh, 0);
        mound.inShape = (x, z) => inWalkRaster(mouth.walk, x, z);
      });
      return mound;
    }
    if (shell === 'keep') {
      const size = towerOf(layout);
      return { ...site, mesh: put(towerMesh(size, deriveSeed(d.seed, 'tower'), land), 0.02), inShape: (x, z, r) => inTowerShape(size, x, z, r), way: TOWER_WAY_IN, out: 2.4, cool: 0 };
    }
    return { ...site, mesh: put(barrowMesh(deriveSeed(d.seed, 'barrow'), land), 0.05), inShape: inBarrowShape, way: WAY_DOWN, out: 2.2, cool: 0 };
  }

  /** New dwellers (a move-in after a clear, or a retake while it stands): only the latest of them lives there. */
  private moved(m: MoveInDecision | RetakeDecision): void {
    const s = this.sites.get(m.dungeon);
    let latest: string | undefined;
    for (const d of this.log) if ((d.kind === 'move-in' || d.kind === 'retake') && d.dungeon === m.dungeon) latest = d.id;
    if (!s || s.cellar.taken === m.id || latest !== m.id) return;
    s.cellar = moveIn(s.first, m, s.place, loreOf(this.host.setting, s.decision.template));
    const b = s.ready;
    if (b) void this.populate(s, b);
  }

  private ensure(s: Site): Promise<Built> {
    s.built ??= this.assemble(s).then((b) => (s.ready = b));
    return s.built;
  }

  private async assemble(s: Site): Promise<Built> {
    const h = this.host;
    // Its own space, deep under the house.
    const m = s.mound, at = m ?? { x: s.house.cx, z: s.house.cz };
    const view = new CellarView(s.first, { x: at.x, y: -400, z: at.z });
    // A cave: its rock carved round its rooms (a worker's few hundred milliseconds), walked as it is seen.
    let carved: CaveSpace | undefined;
    if (s.first.form.space.carved) {
      const layout = s.first.layout, seed = deriveSeed(s.decision.seed, 'cave', 'rock');
      const rock = await (h.jobs ? h.jobs.caveRock(layout, seed) : Promise.resolve((() => { const field = caveField(layout, seed); return { field, shell: caveShell(field, layout, seed) }; })()));
      view.rock = rock.shell;
      carved = new CaveSpace(layout, rock.field);
    }
    await view.add(h.stage);
    // A place on the land: back out in front of its doorway, facing away from it.
    const out = m ? { door: [...onLand(m, 0, m.out), m.yaw + Math.PI] as const } : s.house;
    const visit = new CellarVisit(s.first, out, view, h.player, h.lantern, h.warm, h.sky, h.notes, carved);
    if (!m) visit.above = { town: s.decision.town, house: s.house };
    // Down there nothing of the land above can be seen: it leaves the frame (it was drawn behind the walls).
    visit.onDepth = (below) => {
      // The first time down a place meets the Director's Discovery (plan 4.1, C9); a saved visit was found before.
      if (below && !space && !this.found.has(s.decision.id)) { this.found.add(s.decision.id); h.director.met('discovery'); h.director.model.count('leads'); }
      h.depth(below, [view.group, ...(s.ready ? [s.ready.creatures.group] : [])]);
    };
    visit.onSwap = () => h.swapped();
    const space = this.saved[s.decision.id];
    if (space) visit.restore(space);
    const b = { view, visit } as Built;
    await this.populate(s, b);
    return b;
  }

  /** Its dwellers now: the den, their bodies and the fight (again after a move-in). */
  private async populate(s: Site, b: Built): Promise<void> {
    const h = this.host, cellar = s.cellar, own = occupantId(cellar);
    const was = b.fight;
    if (was) { was.retired = true; b.creatures.group.removeFromParent(); }
    const mine = this.saved[own];
    // Chests opened before new dwellers came stay open; the lair's hoard is theirs.
    const before = own === s.decision.id ? undefined : priorChests(cellar, was ? was.delve.tally() : this.saved[s.decision.id]?.delve, h.setting);
    const saved: DelveSave | undefined = mine?.delve ?? (before ? { dead: [], spared: [], searched: [], opened: before } : undefined);
    b.delve = new Delve(cellar, b.visit.space, h.setting, h.character, h.seed, saved);
    b.creatures = await CreatureView.build(b.delve.den, h.seed, b.view.origin, h.renderer);
    // Its people's shaders build in the Stage's frame slots; they show once warm.
    const drawn = b.creatures;
    this.dwellersWarm = false;
    this.warming = drawn.warm(h.stage).then(() => { h.stage.add(drawn.group); this.dwellersWarm = true; });
    const visit = b.visit, danger = cellarDanger(cellar, h.setting.creatures), place = cellar.house;
    const words = loreOf(h.setting, s.decision.template).words ?? CELLAR_WORDS;
    const arena: Arena = {
      get inside() { return visit.inside; },
      get shown() { return visit.inside; },
      enclosed: true, place: `this ${s.first.form.word}`, danger, promise: own,
      quietLine: fill(words.quiet, { place }),
    };
    b.fight = new Encounter(arena, b.delve, b.creatures, h.hud, h.player, h.notes, h.director, h.setting, h.camera, h.canvas, h.fight, !!mine?.paid || this.kept.has(own));
    b.fight.onCue = (c) => h.cue(c);
    // The chests stand open that were opened (before these dwellers too), shut the rest; searched, a lid lifts.
    for (const x of hoardsOf(cellar, h.setting.creatures)) if (x.prop) b.view.lidUp(x.id, b.delve.hasOpened(x) ? 1 : 0);
    b.fight.onLid = (id, k) => b.view.lidUp(id, k);
  }

  /** The newest dwellers' warm-up (loading waits for the first cellar's; later ones warm while the hero walks to the hatch). */
  warming: Promise<void> = Promise.resolve();
  /** Whether the newest dwellers are drawn (false while they warm up). */
  dwellersWarm = true;
}

/** How a cellar is spoken of when the setting gives no words of its own. */
const CELLAR_WORDS = {
  quiet: 'The cellar of {place} is quiet now. Its household will want to hear.',
  thanks: 'Quiet down there at last? Here, {coins}, and our thanks.',
};

/** A tower's keep for its rooms: as wide and deep as the rooms above the ground, as many storeys as they climb. */
function towerOf(layout: DungeonLayout): ReturnType<typeof towerSize> {
  const up = layout.rooms.filter((r) => r.level >= 0);
  const x0 = Math.min(...up.map((r) => r.x)), x1 = Math.max(...up.map((r) => r.x + r.w));
  const z0 = Math.min(...up.map((r) => r.z)), z1 = Math.max(...up.map((r) => r.z + r.d));
  return towerSize((x1 - x0) * CELL, (z1 - z0) * CELL, layout.levels[1] + 1);
}

/** The chests a cellar's earlier dwellers' visit opened (not the lair's hoard). */
function priorChests(c: Cellar, tally: DelveSave | undefined, setting: SettingModule): number[] {
  if (!tally) return [];
  const chests = new Set(hoardsOf(c, setting.creatures).filter((x) => x.prop).map((x) => x.id));
  return tally.opened.filter((id) => chests.has(id));
}
