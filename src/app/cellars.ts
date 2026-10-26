/**
 * Every cellar the VGM has promised under the town's houses (plan 4.2, 8), and every barrow out on the
 * land (a cellar's making with its own lore; the mound and its passage stand on the land, and walking
 * into the passage goes down), played one at a time. A cellar
 * is outlined from its decision when it is promised (cheap), and built (its meshes, its dwellers' den and
 * bodies, its fight) once the hero steps into the house above, so it stands ready by the time they reach
 * the hatch; the first one is built while the game loads. When new dwellers move into a cleared cellar
 * (a move-in, plan 8.1) its den, bodies and fight are made anew; the rooms and the doors the hero opened
 * stay. What each cellar's visit changed goes into the save by promise id.
 */
import type { Mesh, Object3D, PerspectiveCamera, PointLight, WebGPURenderer } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { TownBuilding } from '@futuremagic/settlement';
import type { Character } from '../game/character';
import { Delve, type DelveSave } from '../game/delve';
import { CellarView } from '../render/dungeon/CellarView';
import { CreatureView } from '../render/dungeon/CreatureView';
import type { SkyView } from '../render/sky';
import type { SettingModule } from '../setting/contract';
import type { Journal } from '../talk/journal';
import type { Director } from '../vgm/director';
import { buildingMeshAt } from '../render/materials/building';
import { houseOf, loreOf, placeOf } from '../vgm/dungeons';
import { occupationOf } from '../vgm/leads';
import type { DecisionLog, DungeonDecision, MoveInDecision } from '../world/decisions';
import { barrowMesh, inBarrowShape, WAY_DOWN } from '../world/dungeon/barrowMesh';
import { moveIn, occupantId, outlineCellar, type Cellar, type DungeonPlace } from '../world/dungeon/cellar';
import { cellarDanger, hoardsOf } from '../world/dungeon/treasure';
import { fill } from '../talk/folk';
import type { Town } from '../world/town';
import { Encounter, type Arena, type FightCue, type FightHost } from './encounter';
import { CellarVisit } from './cellarVisit';
import type { FightHud } from './fightHud';
import type { Notes } from './notes';
import type { Player } from './player';
import type { CellarDiff } from './saveGame';

export interface CellarsHost {
  readonly stage: Stage;
  readonly renderer: WebGPURenderer;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLElement;
  readonly player: Player;
  readonly lantern: PointLight;
  readonly sky: SkyView;
  readonly notes: Notes;
  readonly setting: SettingModule;
  readonly character: Character;
  readonly seed: number;
  readonly director: Director;
  readonly journal: Journal;
  readonly hud: FightHud;
  readonly fight: FightHost;
  /** Up the ladder of a cellar: into its house's room. */
  up(house: TownBuilding): Promise<void>;
  /** After going down or coming up (the game autosaves). */
  swapped(): void;
  /** A fight's sounds and music. */
  cue(c: FightCue): void;
  /** `?dweller=`: who lives in every cellar (for looking at them). */
  readonly dweller: string | null;
  /** The land's height (a barrow stands on it). */
  ground(x: number, z: number): number;
  /** Down (true) or up again: the land above leaves the frame meanwhile, all but `keep` (the cellar and its dwellers). */
  depth(below: boolean, keep: readonly Object3D[]): void;
}

/** A barrow's mound on the land: where it stands and its mesh. */
interface Mound {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly mesh: Mesh;
  /** Seconds before walking into the passage goes down again (after coming up). */
  cool: number;
}

/** A barrow is built (rooms, dwellers) once the hero is this near, metres. */
const BARROW_NEAR = 250;

/** One cellar: its promise and house; its parts once built. */
interface Site {
  readonly decision: DungeonDecision;
  /** A cellar's house above; a barrow's household who knows of it. */
  readonly house: TownBuilding;
  readonly place: DungeonPlace;
  /** A barrow's mound on the land (none: a cellar, reached through its house). */
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
  /** Houses with a cellar, and the way down (the town's rooms read it). */
  readonly down = new Map<number, (before: () => void) => Promise<void>>();
  private log: DecisionLog = [];

  constructor(private readonly host: CellarsHost, private readonly towns: readonly Town[], private readonly saved: Readonly<Record<string, CellarDiff>> = {}) {}

  /** The promises in the log (call again as it grows): new cellars get a hatch, moved-into ones new dwellers. */
  sync(log: DecisionLog): void {
    this.log = log;
    for (const d of log) {
      if (d.kind === 'dungeon' && !this.sites.has(d.id)) this.open(d);
      else if (d.kind === 'move-in') this.moved(d);
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
  near(building: number): void {
    for (const s of this.sites.values()) if (!s.mound && s.house.id === building && !s.built) void this.ensure(s);
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
      const [wx, wz] = turn(m, WAY_DOWN.x, WAY_DOWN.z);
      if (s.ready && !s.ready.visit.inside && m.cool === 0 && Math.hypot(x - wx, z - wz) < 0.9) {
        m.cool = 3;
        void s.ready.visit.enter();
      }
    }
  }

  /** Is a body of radius `r` at (x, z) on the land inside a barrow's mound or its slabs? */
  solid(x: number, z: number, r: number): boolean {
    for (const s of this.sites.values()) {
      const m = s.mound;
      if (!m || Math.abs(x - m.x) > 20 || Math.abs(z - m.z) > 20) continue;
      // Into the mound's own frame (the inverse of `turn`).
      const dx = x - m.x, dz = z - m.z, c = Math.cos(m.yaw), sn = Math.sin(m.yaw);
      if (inBarrowShape(dx * c - dz * sn, dx * sn + dz * c, r)) return true;
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

  /** What each cellar's visit changed, by promise id (cellars not built since loading keep what the save had). */
  diffs(): Record<string, CellarDiff> {
    const out: Record<string, CellarDiff> = { ...this.saved };
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
    const house = houseOf(d, this.towns), place = placeOf(d, this.towns);
    if (!house || !place) return;
    const lore = loreOf(this.host.setting, d.template);
    const only = this.host.dweller ? lore.dwellers.filter((w) => w.id === this.host.dweller) : [];
    const first = only.length ? outlineCellar({ ...d, danger: undefined }, place, { ...lore, dwellers: only }) : outlineCellar(d, place, lore);
    const m = occupationOf(this.log, d.id);
    const mound = d.site ? this.heap(d.site) : null;
    const s: Site = { decision: d, house, place, mound, first, cellar: m ? moveIn(first, m, place, lore) : first, built: null, ready: null };
    this.sites.set(d.id, s);
    if (mound) return;
    this.down.set(house.id, async (before) => {
      const v = (await this.ensure(s)).visit;
      await v.enter(false, undefined, before);
    });
  }

  /** A barrow's mound and passage, on the land at its site (the town's building shader: nothing new to build). */
  private heap(site: { readonly x: number; readonly z: number; readonly yaw: number }): Mound {
    const mesh = buildingMeshAt(barrowMesh(), site.x, this.host.ground(site.x, site.z) - 0.05, site.z, 'barrow');
    mesh.rotation.y = site.yaw;
    void this.host.stage.add(mesh);
    return { ...site, mesh, cool: 0 };
  }

  private moved(m: MoveInDecision): void {
    const s = this.sites.get(m.dungeon);
    if (!s || occupantId(s.cellar) === m.id || occupationOf(this.log, m.dungeon)?.id !== m.id) return;
    s.cellar = moveIn(s.first, m, s.house, this.host.setting.dungeons.cellar);
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
    await view.add(h.stage);
    // A barrow: back out into its forecourt, facing away from the mound.
    const out = m ? { door: [...turn(m, 0, 2.2), m.yaw + Math.PI] as const } : s.house;
    const visit = new CellarVisit(s.first, out, view, h.player, h.lantern, h.sky, h.notes);
    const words = loreOf(h.setting, s.decision.template).words;
    if (words) visit.entering = fill(words.enter, { place: s.cellar.house });
    if (!m) visit.up = () => h.up(s.house);
    // Down there nothing of the land above can be seen: it leaves the frame (it was drawn behind the walls).
    visit.onDepth = (below) => h.depth(below, [view.group, ...(s.ready ? [s.ready.creatures.group] : [])]);
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
    this.warming = drawn.warm(h.stage).then(() => h.stage.add(drawn.group));
    const visit = b.visit, danger = cellarDanger(cellar, h.setting.creatures), place = cellar.house;
    const words = loreOf(h.setting, s.decision.template).words ?? CELLAR_WORDS;
    const arena: Arena = {
      get inside() { return visit.inside; },
      get shown() { return visit.inside; },
      enclosed: true, place: s.mound ? 'this barrow' : 'this cellar', danger, promise: own,
      quietLine: fill(words.quiet, { place }),
      thanks: (coins) => fill(words.thanks, { place, coins }),
    };
    b.fight = new Encounter(arena, b.delve, b.creatures, h.hud, h.player, h.notes, h.director, h.setting, h.journal, h.camera, h.canvas, h.fight, !!mine?.paid);
    b.fight.onCue = (c) => h.cue(c);
  }

  /** The newest dwellers' warm-up (loading waits for the first cellar's; later ones warm while the hero walks to the hatch). */
  warming: Promise<void> = Promise.resolve();
}

/** How a cellar is spoken of when the setting gives no words of its own. */
const CELLAR_WORDS = {
  enter: 'You climb down into the cellar of {place}.',
  quiet: 'The cellar of {place} is quiet now. Its household will want to hear.',
  thanks: 'The household of {place} hears the cellar is safe and presses {coins} into your hand.',
};

/** A point of a barrow's own frame (x, z) on the land: turned by its yaw, at its site. */
function turn(m: { readonly x: number; readonly z: number; readonly yaw: number }, x: number, z: number): [number, number] {
  const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  return [m.x + x * c + z * s, m.z - x * s + z * c];
}

/** The chests a cellar's earlier dwellers' visit opened (not the lair's hoard). */
function priorChests(c: Cellar, tally: DelveSave | undefined, setting: SettingModule): number[] {
  if (!tally) return [];
  const chests = new Set(hoardsOf(c, setting.creatures).filter((x) => x.prop).map((x) => x.id));
  return tally.opened.filter((id) => chests.has(id));
}
