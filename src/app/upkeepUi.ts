/**
 * Upkeep in the town (plan 11.5, 11.2): the innkeeper lets a room for the night and the smith mends gear,
 * each as a talk topic (TownTalk services) that opens its moment; and where a fallen hero wakes, which is
 * the inn where they last slept (game/upkeep.ts wakePlace). The rules are in game/upkeep.ts; this joins
 * them to the talk, the clock, the rooms and the windows.
 */
import type { Township } from '../game/township';
import type { SettingModule } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, type Item } from '../game/items';
import { takeRoom, wakePlace } from '../game/upkeep';
import type { Person } from '../sim/people';
import { fill } from '../talk/folk';
import type { Service } from '../talk/townTalk';
import { RepairUi } from './repairUi';
import { Sleep } from './sleep';
import type { WindowHost } from './window';
import type { TownDoor } from './towns';

/** The topic ids upkeep answers. */
export const UPKEEP_SERVICES = ['room', 'repair'] as const;

export interface UpkeepHost extends WindowHost {
  /** The town of whoever the hero talks with (null: none). */
  readonly town: Township | null;
  /** A town by its id (where the hero last took a room). */
  townOf(id: string): Township | null;
  /** Where a fallen hero is carried with no room taken: the nearest town with a temple or an inn. */
  readonly refuge: Township | null;
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

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly host: UpkeepHost) {
    this.bench = new RepairUi(hero, setting, host);
  }

  /** What a townsperson offers: the innkeeper a room, the smith mending. */
  services(p: Person): Service[] {
    const up = this.setting.upkeep, w = up.words;
    if (p.role !== 'trade') return [];
    if (p.trade === 'innkeeper') {
      const price = coinText(up.room);
      return [{ id: 'room', label: fill(w.roomTopic, { price }), line: this.hero.coins >= up.room ? fill(w.roomGiven, { price: price.charAt(0).toUpperCase() + price.slice(1) }) : fill(w.roomTooDear, { price }) }];
    }
    if (p.trade === 'smith') return [{ id: 'repair', label: w.repairTopic, line: w.repairLine }];
    return [];
  }

  /** A service was asked of `p` (its talk has ended): the night at the inn, or the smith's bench. */
  answer(id: string, p: Person, name: string): void {
    if (id === 'repair') { this.bench.atBench(name); return; }
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
