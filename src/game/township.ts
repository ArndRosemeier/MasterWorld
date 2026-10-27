/**
 * One town's core (plan B3a): who lives there, what they know and say, what its merchants have and the
 * animals in its paddocks. The start town, every hamlet and every village run on this one class; a town
 * differs only by its plan (its size, its buildings) and its seed. Made from the decision log and the
 * town's saved state; the game, the loop check and the tests all use it. Pure.
 */
import type { SettingModule } from '../setting/contract';
import { Herds } from '../sim/livestock';
import { townsfolk, type Person } from '../sim/people';
import { TownLife, type TownOrder } from '../sim/townLife';
import { talkCellar, townTalk, type TownTalk, type TownTalkSave } from '../talk/townTalk';
import { keptOf } from '../vgm/leads';
import { ordersOf } from '../vgm/orders';
import type { Decision, DecisionLog } from '../world/decisions';
import type { Town } from '../world/town';
import type { Standing } from './standing';
import { Market, type MarketSave } from './trade';

/** What a town keeps in a save. */
export interface TownshipSave {
  readonly talk?: TownTalkSave;
  readonly market?: MarketSave;
}

export interface TownshipContext {
  /** The world's seed. */
  readonly seed: number;
  readonly setting: SettingModule;
  /** The decision log now. */
  log(): DecisionLog;
  /** Game hours since the world began. */
  hours(): number;
  /** The hero's standing with each people (merchants' prices follow it); none: as with any stranger. */
  readonly standing?: Standing;
}

/** A town's own seed: its decision's, else (the start town) the world's. */
export function townSeed(town: Town, seed: number): number {
  return town.decision.seed ?? seed;
}

export class Township {
  readonly id: string;
  /** The seed its people, words and merchants come from. */
  readonly seed: number;
  private peopleOf: readonly Person[] | null = null;
  private lifeOf: TownLife | null = null;
  private talkOf: TownTalk | null = null;
  private marketOf: Market | null = null;
  private herdsOf: Herds | null | undefined;
  /** Set on the town's words when they are made (the game: how its people take the hero). */
  onTalk: ((talk: TownTalk) => void) | null = null;

  constructor(readonly town: Town, private readonly c: TownshipContext, private readonly saved: TownshipSave = {}) {
    this.id = town.decision.id;
    this.seed = townSeed(town, c.seed);
  }

  /** Everyone living here (the town is planned when first asked: a far town's plan waits). */
  get residents(): readonly Person[] {
    return (this.peopleOf ??= townsfolk(this.town.plan, this.seed));
  }

  /** Its people's days (the world simulation), made when first asked for. */
  get life(): TownLife {
    if (this.lifeOf) return this.lifeOf;
    const life = new TownLife(this.town.plan, this.seed, this.c.hours(), this.c.setting.routines, this.residents);
    // The VGM's orders to this town so far (logged; a save replays them).
    for (const o of ordersOf(this.c.log(), this.id)) life.order(o);
    return (this.lifeOf = life);
  }

  /** A VGM order for this town (a gathering, a curfew): into the log by the caller, and its people follow it. */
  obey(o: TownOrder): void {
    this.life.order(o);
  }

  /** Whether its people live yet (a town far off never needed them). */
  get living(): boolean { return this.lifeOf !== null; }

  /** What its people know and say (made the first time anyone talks here: it takes a few milliseconds). */
  get talk(): TownTalk {
    if (this.talkOf) return this.talkOf;
    const log = this.c.log();
    const t = townTalk(this.seed, this.c.setting, this.town, this.residents, log, this.saved.talk).talk;
    // Promises kept before (an older save paid on leaving): nobody speaks of their trouble any more.
    for (const id of keptOf(log)) t.hush(id);
    this.talkOf = t;
    this.onTalk?.(t);
    return t;
  }

  /** Whether its words were made (only those are saved). */
  get talked(): boolean { return this.talkOf !== null; }

  /** Its merchants (none in a town without shops or stalls). */
  get market(): Market {
    if (this.marketOf) return this.marketOf;
    const m = new Market(this.c.setting, this.residents, this.seed, Math.floor(this.c.hours() / 24), this.saved.market);
    if (this.c.standing) m.standing = this.c.standing;
    return (this.marketOf = m);
  }

  /** The animals in its paddocks (null: it has none). */
  get herds(): Herds | null {
    if (this.herdsOf === undefined) this.herdsOf = this.town.plan.paddocks.length ? new Herds(this.town.plan, this.seed) : null;
    return this.herdsOf;
  }

  /** A promise the VGM made (already in the log): its people hear of it if it is one of theirs. */
  promised(d: Decision): void {
    if (!this.talkOf) return; // made later, the words read the log
    const c = talkCellar(d, this.c.setting, this.town, this.residents, this.c.log());
    if (c) this.talkOf.add(c);
  }

  /** What it keeps in a save (nothing if the hero never talked or traded there). */
  toSave(): TownshipSave {
    return { ...(this.talkOf ? { talk: this.talkOf.save() } : this.saved.talk ? { talk: this.saved.talk } : {}), ...(this.marketOf ? { market: this.marketOf.save() } : this.saved.market ? { market: this.saved.market } : {}) };
  }
}
