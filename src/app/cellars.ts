/**
 * Every cellar the VGM has promised under the town's houses (plan 4.2, 8), played one at a time. A cellar
 * is outlined from its decision when it is promised (cheap), and built (its meshes, its dwellers' den and
 * bodies, its fight) once the hero steps into the house above, so it stands ready by the time they reach
 * the hatch; the first one is built while the game loads. When new dwellers move into a cleared cellar
 * (a move-in, plan 8.1) its den, bodies and fight are made anew; the rooms and the doors the hero opened
 * stay. What each cellar's visit changed goes into the save by promise id.
 */
import type { PerspectiveCamera, PointLight, WebGPURenderer } from 'three/webgpu';
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
import { houseOf } from '../vgm/dungeons';
import { occupationOf } from '../vgm/leads';
import type { DecisionLog, DungeonDecision, MoveInDecision } from '../world/decisions';
import { moveIn, occupantId, outlineCellar, type Cellar } from '../world/dungeon/cellar';
import { cellarDanger, hoardsOf } from '../world/dungeon/treasure';
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
}

/** One cellar: its promise and house; its parts once built. */
interface Site {
  readonly decision: DungeonDecision;
  readonly house: TownBuilding;
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
    for (const s of this.sites.values()) if (s.house.id === building && !s.built) void this.ensure(s);
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
    const house = houseOf(d, this.towns);
    if (!house) return;
    const lore = this.host.setting.dungeons.cellar;
    const only = this.host.dweller ? lore.dwellers.filter((w) => w.id === this.host.dweller) : [];
    const first = only.length ? outlineCellar({ ...d, danger: undefined }, house, { ...lore, dwellers: only }) : outlineCellar(d, house, lore);
    const m = occupationOf(this.log, d.id);
    const s: Site = { decision: d, house, first, cellar: m ? moveIn(first, m, house, lore) : first, built: null, ready: null };
    this.sites.set(d.id, s);
    this.down.set(house.id, async (before) => {
      const v = (await this.ensure(s)).visit;
      await v.enter(false, undefined, before);
    });
  }

  private moved(m: MoveInDecision): void {
    const s = this.sites.get(m.dungeon);
    if (!s || occupantId(s.cellar) === m.id || occupationOf(this.log, m.dungeon)?.id !== m.id) return;
    s.cellar = moveIn(s.first, m, s.house, this.host.setting.dungeons.cellar);
    const b = s.ready;
    if (b) void this.populate(s, b);
  }

  private ensure(s: Site): Promise<Built> {
    s.built ??= this.make(s).then((b) => (s.ready = b));
    return s.built;
  }

  private async make(s: Site): Promise<Built> {
    const h = this.host;
    // Its own space, deep under the house.
    const view = new CellarView(s.first, { x: s.house.cx, y: -400, z: s.house.cz });
    await view.add(h.stage);
    const visit = new CellarVisit(s.first, s.house, view, h.player, h.lantern, h.sky, h.notes);
    visit.up = () => h.up(s.house);
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
    const visit = b.visit, danger = cellarDanger(cellar, h.setting.creatures), house = cellar.house;
    const arena: Arena = {
      get inside() { return visit.inside; },
      get shown() { return visit.inside; },
      enclosed: true, place: 'this cellar', danger, promise: own,
      quietLine: `The cellar of ${house} is quiet now. Its household will want to hear.`,
      thanks: (coins) => `The household of ${house} hears the cellar is safe and presses ${coins} into your hand.`,
    };
    b.fight = new Encounter(arena, b.delve, b.creatures, h.hud, h.player, h.notes, h.director, h.setting, h.journal, h.camera, h.canvas, h.fight, !!mine?.paid);
    b.fight.onCue = (c) => h.cue(c);
  }

  /** The newest dwellers' warm-up (loading waits for the first cellar's; later ones warm while the hero walks to the hatch). */
  warming: Promise<void> = Promise.resolve();
}

/** The chests a cellar's earlier dwellers' visit opened (not the lair's hoard). */
function priorChests(c: Cellar, tally: DelveSave | undefined, setting: SettingModule): number[] {
  if (!tally) return [];
  const chests = new Set(hoardsOf(c, setting.creatures).filter((x) => x.prop).map((x) => x.id));
  return tally.opened.filter((id) => chests.has(id));
}
