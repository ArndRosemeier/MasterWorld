/**
 * Upkeep in the town (plan 11.5, 11.2): the innkeeper lets a room for the night and a seat on the cart to
 * another town's inn (plan 5.4, C7; vgm/journeys.ts), the smith mends gear, each as a talk topic (TownTalk
 * services) that opens its moment; and where a fallen hero wakes, which is the inn where they last slept
 * (game/upkeep.ts wakePlace). The rules are in game/upkeep.ts; this joins
 * them to the talk, the clock, the rooms and the windows.
 */
import type { Township } from '../game/township';
import type { SettingModule } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, type Item } from '../game/items';
import { takeRoom, wakePlace } from '../game/upkeep';
import { buildingOf, type Person } from '../sim/people';
import { cartArrived, cartTopic, cartWays, journeyOf, type CartWay } from '../vgm/journeys';
import { settlementOf, type DecisionLog, type DelayDecision, type JourneyDecision, type RegionDecision, type TownDecision } from '../world/decisions';
import type { FrontierContext } from '../vgm/frontier';
import { farHarbourFor, holdFor, seaWays, voyageOf, voyageTopic, type SeaWay, type SeaWeather } from '../vgm/voyages';
import { islandFor } from '../vgm/islands';
import { cap, fill } from '../talk/folk';
import type { Service } from '../talk/townTalk';
import { RepairUi } from './repairUi';
import { Sleep } from './sleep';
import type { WindowHost } from './window';
import type { TownDoor } from './towns';

/** The topic ids upkeep answers: a room, mending, and a seat on the cart (one id per way offered). */
export const UPKEEP_SERVICES = ['room', 'repair', 'cart-0', 'cart-1', 'cart-2', 'cart-3', 'cart-4', 'cart-5', 'sea-0', 'sea-1', 'sea-2'] as const;
const CART_IDS = UPKEEP_SERVICES.filter((id) => id.startsWith('cart-'));
const SEA_IDS = UPKEEP_SERVICES.filter((id) => id.startsWith('sea-'));
/** The ship casts off this long after passage is bought (game hours: some 45 s, to walk to her and go aboard). */
const BOARDING = 0.3;
/** "3 hours", "1 hour" (at least one). */
const hoursText = (h: number): string => { const n = Math.max(1, Math.round(h)); return `${n} hour${n === 1 ? '' : 's'}`; };

export interface UpkeepHost extends WindowHost {
  /** The town of whoever the hero talks with (null: none). */
  readonly town: Township | null;
  /** A town by its id (where the hero last took a room). */
  townOf(id: string): Township | null;
  /** Where a fallen hero is carried with no room taken: the nearest town with a temple or an inn. */
  readonly refuge: Township | null;
  /** Every town (the carts go to those the hero has been to). */
  readonly towns: readonly Township[];
  /** The decision log now, and a journey into it (the VGM knows where the hero goes). */
  log(): DecisionLog;
  journey(d: JourneyDecision): void;
  /** A ship held in harbour by a storm (S10, the VGM's `hold-ship`) into the log, and the weather the harbour master reads. */
  hold(d: DelayDecision): void;
  readonly weather: SeaWeather;
  /** The frontier as the VGM sees it now (for a harbour across the water), and a region it opens into the log. */
  frontier(): FrontierContext;
  openRegion(d: RegionDecision): void;
  /** Water depth at a point (0 on land). */
  water(x: number, z: number): number;
  /** Game hours since the world began, and setting the clock to an hour. */
  hours(): number;
  setClock(hours: number): void;
  /** Into a building's room at once (the screen is dark). */
  enter(door: TownDoor): Promise<void>;
  say(text: string, seconds: number): void;
  /** What an item is worth as new, copper. */
  worth(it: Item): number;
  /** The hammer rings (a piece was mended). */
  rang(): void;
}

export class UpkeepUi {
  private readonly sleep = new Sleep();
  readonly bench: RepairUi;
  /** The cart's ways the innkeeper last offered, by topic id. */
  private ways: CartWay[] = [];
  /** The ships' ways the harbour master last offered, by topic id, and for which town and log they were found. */
  private voyages: SeaWay[] = [];
  private voyagesFor: { town: string; log: DecisionLog } | null = null;

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly host: UpkeepHost) {
    this.bench = new RepairUi(hero, setting, host);
  }

  /** What a townsperson offers: the innkeeper a room, the smith mending. */
  services(p: Person): Service[] {
    const up = this.setting.upkeep, w = up.words;
    if (p.role !== 'trade') return [];
    if (p.trade === 'innkeeper') {
      const price = coinText(up.room);
      const room = { id: 'room', label: fill(w.roomTopic, { price }), line: this.hero.coins >= up.room ? fill(w.roomGiven, { price: cap(price) }) : fill(w.roomTooDear, { price }) };
      return [room, ...this.carts()];
    }
    if (p.trade === 'smith') return [{ id: 'repair', label: w.repairTopic, line: w.repairLine }];
    if (p.trade === 'harbourmaster') return this.passages();
    return [];
  }

  /**
   * The harbour master's passages by ship to the nearest harbour towns along the coast (S4). With none in reach the
   * VGM opens one across the water first (vgm/voyages.ts farHarbourFor), and promises an island in reach (S7,
   * vgm/islands.ts islandFor: sailors talk of it). Found once per town while the log stands.
   */
  private passages(): { id: string; label: string; line: string }[] {
    const def = this.setting.voyage, town = this.host.town, log = this.host.log();
    if (!def || !town?.town.decision.harbour) return [];
    if (this.voyagesFor?.town !== town.id || this.voyagesFor.log !== log) {
      const from = town.town.decision, known = this.host.towns.map((t) => t.town.decision);
      const fills = this.setting.regions?.fills ?? [];
      const depth = (x: number, z: number) => this.host.water(x, z), opened: TownDecision[] = [];
      // Each opened region is in the log before the next is looked for (they never take the same square).
      for (const ask of [farHarbourFor, islandFor]) {
        const r = ask(def, this.host.frontier(), from, [...known, ...opened], depth), town = r && settlementOf(r, fills);
        if (!r) continue;
        this.host.openRegion(r);
        if (town) opened.push(town);
      }
      this.voyages = seaWays(def, this.host.frontier().seed, this.host.log(), from, [...known, ...opened], depth).slice(0, SEA_IDS.length);
      this.voyagesFor = { town: town.id, log: this.host.log() };
    }
    return this.voyages.map((w, i) => {
      const price = coinText(w.fare), held = this.holdOf(w);
      const given = held ? fill(def.words.held, { price: cap(price), hours: hoursText(held.until - this.host.hours()) }) : fill(def.words.given, { price: cap(price) });
      return { id: SEA_IDS[i], label: voyageTopic(def, w), line: this.hero.coins >= w.fare ? given : fill(def.words.tooDear, { price }) };
    });
  }

  /** The voyage `w` as it would be bought now, and the VGM's hold on it if a storm keeps her in (S10). */
  private holdOf(w: SeaWay, j = voyageOf(this.host.log(), this.host.town?.id ?? '', w, this.host.hours() + BOARDING)): DelayDecision | null {
    const at = this.host.town?.town.decision;
    return at ? holdFor(this.host.log(), j, at.x, at.z, this.host.weather) : null;
  }

  /** Passage was bought: paid, and the voyage logged; her crew make ready and she casts off a little later. */
  private embark(w: SeaWay): void {
    const from = this.host.town;
    if (!from || this.hero.coins < w.fare) return;
    this.hero.coins -= w.fare;
    const j = voyageOf(this.host.log(), from.id, w, this.host.hours() + BOARDING);
    this.host.journey(j);
    const held = this.holdOf(w, j);
    if (held) this.host.hold(held);
  }

  /** The innkeeper's seats on the cart, to the nearest towns the hero has been to (none in a town without carts). */
  private carts(): { id: string; label: string; line: string }[] {
    const tr = this.setting.travel, town = this.host.town;
    if (!tr || !town) return [];
    this.ways = cartWays(tr, this.host.log(), town.town, this.host.towns.map((t) => t.town), (id) => !!this.host.towns.find((t) => t.id === id)?.been).slice(0, CART_IDS.length);
    return this.ways.map((w, i) => {
      const price = coinText(w.fare);
      return { id: CART_IDS[i], label: cartTopic(tr, w), line: this.hero.coins >= w.fare ? fill(tr.words.given, { price: cap(price) }) : fill(tr.words.tooDear, { price }) };
    });
  }

  /** A seat on the cart was taken: paid, logged, the road goes by, and the hero steps out at the other inn. */
  private ride(w: CartWay): void {
    const tr = this.setting.travel, from = this.host.town, to = this.host.towns.find((t) => t.id === w.to);
    const inn = to && buildingOf(to.town.plan, 'inn');
    if (!tr || !from || !to || !inn || this.sleep.busy || this.hero.coins < w.fare) return;
    this.hero.coins -= w.fare;
    this.host.journey(journeyOf(this.host.log(), from.id, w, this.host.hours()));
    this.host.paused(true);
    void this.sleep.through(async () => {
      this.host.setClock(this.host.hours() + w.hours);
      await this.host.enter({ town: to, b: inn });
    }, tr.words.going).then(() => {
      this.host.paused(false);
      this.host.say(cartArrived(tr, w), 7);
    });
  }

  /** A service was asked of `p` (its talk has ended): the night at the inn, a seat on the cart, or the smith's bench. */
  answer(id: string, p: Person, name: string): void {
    if (id === 'repair') { this.bench.atBench(name); return; }
    const way = this.ways[CART_IDS.indexOf(id as typeof CART_IDS[number])];
    if (id.startsWith('cart-')) { if (way) this.ride(way); return; }
    if (id.startsWith('sea-')) { const v = this.voyages[SEA_IDS.indexOf(id as typeof SEA_IDS[number])]; if (v) this.embark(v); return; }
    const town = this.host.town;
    if (id !== 'room' || !town) return;
    const inn = town.town.plan.buildings[p.home];
    if (!inn || this.sleep.busy) return;
    const night = takeRoom(this.hero, this.host.hours(), { town: town.id, building: inn.id }, this.setting.upkeep);
    if (!night) return;
    this.host.paused(true);
    void this.sleep.through(async () => {
      this.host.setClock(night.wake);
      await this.host.enter({ town, b: inn });
    }).then(() => {
      this.host.paused(false);
      this.host.say(this.setting.upkeep.words.slept, 7);
    });
  }

  /** Where a fallen hero wakes (in the town of their room, else the refuge; null: nowhere) and how the place is said. */
  waking(): { readonly door: TownDoor | null; readonly said: string } {
    const w = this.setting.upkeep.words, lodged = this.hero.lodging ? this.host.townOf(this.hero.lodging.town) : null;
    const town = lodged ?? this.host.refuge;
    const at = town ? wakePlace(this.hero.lodging, town.id, town.town.plan) : null;
    const b = at && town ? town.town.plan.buildings[at.building] : undefined;
    return { door: b && town ? { town, b } : null, said: !at ? w.wakeInn : at.kind === 'room' ? w.wakeRoom : at.kind === 'temple' ? w.wakeTemple : w.wakeInn };
  }
}
