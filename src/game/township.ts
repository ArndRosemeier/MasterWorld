/**
 * One town's core (plan B3a): who lives there, what they know and say, what its merchants have and the
 * animals in its paddocks. The start town, every hamlet and every village run on this one class; a town
 * differs only by its plan (its size, its buildings) and its seed. Made from the decision log and the
 * town's saved state; the game, the loop check and the tests all use it. Pure.
 */
import type { SettingModule } from '../setting/contract';
import { Herds } from '../sim/livestock';
import { townsfolk, type Person } from '../sim/people';
import { TownLife, type Agent, type TownOrder } from '../sim/townLife';
import { NavGraph } from '../sim/nav';
import { talkCellar, talkEvent, townTalk, type TownTalk, type TownTalkSave } from '../talk/townTalk';
import { keptOf } from '../vgm/leads';
import { ordersOf } from '../vgm/orders';
import { heldBy, refugeOf, takenFrom } from '../vgm/events';
import type { Decision, DecisionLog, RetreatDecision, TravellerDecision } from '../world/decisions';
import { restingAt } from '../vgm/answers';
import { strayAt } from '../vgm/situations';
import { onCircle } from '../world/sites';
import type { Town } from '../world/town';
import { bardOf, guildHouses, staffGuilds, type GuildHouse } from './guilds';
import type { Standing } from './standing';
import { Market, type MarketSave } from './trade';

/** How many of a taken place's folk wait at their camp, and how far round its middle they sit (m). */
const CAMPED = 5;
const CAMP_R = 2.4;

/** How far before a teacher's tower door its master stands watch, metres. */
const WATCH = 3;

/** What a town keeps in a save. */
export interface TownshipSave {
  readonly talk?: TownTalkSave;
  readonly market?: MarketSave;
  /** The hero has been here (the carts go to such towns, C7). */
  readonly been?: boolean;
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
  /** Every town standing (a story event's words name other places: a waystation taken); none: this one alone. */
  towns?(): readonly Town[];
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
  /** The log's length when the herds last read it. */
  private herdsLog = -1;
  /** The log's length when the people last looked whether a band holds the place. */
  private heldLog = -1;
  private housesOf: readonly GuildHouse[] | null = null;
  /** The hero has been here (C7: the carts go only to towns the hero knows). */
  been: boolean;
  /** Set on the town's words when they are made (the game: how its people take the hero). */
  onTalk: ((talk: TownTalk) => void) | null = null;

  constructor(readonly town: Town, private readonly c: TownshipContext, private readonly saved: TownshipSave = {}) {
    this.id = town.decision.id;
    this.seed = townSeed(town, c.seed);
    this.been = !!saved.been;
  }

  /** Everyone living here (the town is planned when first asked: a far town's plan waits); its guild houses' trainers among them. */
  get residents(): readonly Person[] {
    if (this.peopleOf) return this.peopleOf;
    const people = townsfolk(this.town.plan, this.seed);
    staffGuilds(people, this.guilds);
    return (this.peopleOf = people);
  }

  /** Its guild houses (D49; none in a town too small for any guild). */
  get guilds(): readonly GuildHouse[] {
    return (this.housesOf ??= guildHouses(this.town.plan, this.town.decision.size ?? 'town', this.c.setting, this.retreats));
  }

  /** The teachers' places out on the land that belong to this town (C3: the warden's tower). */
  get retreats(): readonly RetreatDecision[] {
    return this.c.log().filter((d): d is RetreatDecision => d.kind === 'retreat' && d.town === this.id);
  }

  /**
   * Where its people stand out on the land now: the teachers' towers, its traveller resting by the hero's way
   * (C9), and while a band holds the place, its folk's camp outside the town they fled to (C11).
   */
  get posts(): readonly { readonly x: number; readonly z: number }[] {
    const log = this.c.log(), camp = this.camp(log);
    return [...this.retreats, ...restingAt(log, this.c.hours(), this.id), ...(camp ? [camp] : []), ...[...this.waiting.values()].map((w) => w.at)];
  }

  /** Who of its folk wait outside a place out on the land for the hero (one of a promise's household), by promise. */
  private readonly waiting = new Map<string, { readonly agent: Agent; readonly at: { readonly x: number; readonly z: number } }>();

  /**
   * `person` (of a promise's household) goes to wait outside the place of promise `id`, at (x, z) facing `dir`
   * (an agent's: atan2 of z and x), until it is quiet: they come in to the hero then (app/ownerComes.ts). Their
   * agent, or null (not living here, or keeping watch at another post).
   */
  waitAt(id: string, person: number, x: number, z: number, dir: number): Agent | null {
    const w = this.waiting.get(id);
    if (w) return w.agent;
    const life = this.life, a = life.agents.find((p) => p.person.id === person);
    if (!a || a.post) return null;
    life.station(a, x, z, dir);
    this.waiting.set(id, { agent: a, at: { x, z } });
    return a;
  }

  /** Who waits outside the place of promise `id` (null: nobody). */
  waiterOf(id: string): Agent | null { return this.waiting.get(id)?.agent ?? null; }

  /** The wait outside the place of promise `id` is over: they go home (out of sight first: the caller says when). */
  waitOver(id: string): void {
    const w = this.waiting.get(id);
    if (!w) return;
    this.waiting.delete(id);
    this.lifeOf?.unstation(w.agent);
  }

  /** Every town standing (or this one alone). */
  private get world(): readonly Town[] {
    return this.c.towns?.() ?? [this.town];
  }

  /** Where its folk camp while a band holds the place (null: it is not held). */
  private camp(log: DecisionLog): { readonly x: number; readonly z: number } | null {
    const e = heldBy(log, this.id);
    return e ? refugeOf(this.world, e) : null;
  }

  /** The guild whose house building `id` is (null: a plain building). */
  guildAt(id: number): GuildHouse | null {
    return this.guilds.find((h) => h.b.id === id) ?? null;
  }

  /** The bard at its inn, who knows every guild house (null: no inn). */
  get bard(): Person | null {
    return bardOf(this.residents, this.town.plan);
  }

  /** Its people's days (the world simulation), made when first asked for; while a band holds the place its folk are gone. */
  get life(): TownLife {
    if (this.lifeOf) {
      const log = this.c.log();
      if (log.length !== this.heldLog) { this.heldLog = log.length; this.lifeOf.gone = !!heldBy(log, this.id); this.shelter(this.lifeOf); }
      this.rest(this.lifeOf);
      this.chase(this.lifeOf);
      return this.lifeOf;
    }
    // Being made over frames (`warm`): the rest at once now.
    while (!this.warm(Infinity));
    return this.life;
  }

  /** Its people's days while they are made over several frames (`warm`): the street graph, then the town with its people coming in. */
  private making: { nav: NavGraph | null; life: TownLife | null } | null = null;

  /**
   * Makes its people's days a step at a time, about `ms` milliseconds a call (a capital's 2700 people took a tenth
   * of a second in one frame): who lives here, the street graph, the spots, then its people in batches. True once
   * they live (`life` is ready).
   */
  warm(ms: number): boolean {
    if (this.lifeOf) return true;
    const m = (this.making ??= { nav: null, life: null });
    if (!this.peopleOf) { void this.residents; if (ms !== Infinity) return false; }
    if (!m.nav) { m.nav = new NavGraph(this.town.plan); if (ms !== Infinity) return false; }
    if (!m.life) { m.life = new TownLife(this.town.plan, this.seed, this.c.hours(), this.c.setting.routines, this.residents, { nav: m.nav, later: true }); if (ms !== Infinity) return false; }
    if (!m.life.grow(ms)) return false;
    this.making = null;
    this.startDays(m.life);
    return true;
  }

  /** Its people's days begin: the VGM's orders so far, its folk gone or sheltering, its masters at their posts. */
  private startDays(life: TownLife): void {
    // The VGM's orders to this town so far (logged; a save replays them).
    for (const o of ordersOf(this.c.log(), this.id)) life.order(o);
    life.gone = !!heldBy(this.c.log(), this.id);
    this.heldLog = this.c.log().length;
    this.shelter(life);
    // A master with a place out on the land keeps watch at its door, facing the town.
    for (const { guild, out } of this.guilds) {
      const a = out && life.agents.find((x) => x.person.trade === guild.keeper);
      if (!a || !out) continue;
      const x = out.x + Math.sin(out.yaw) * WATCH, z = out.z + Math.cos(out.yaw) * WATCH;
      life.station(a, x, z, Math.atan2(this.town.decision.z - z, this.town.decision.x - x));
    }
    this.rest(life);
    this.lifeOf = life;
    this.chase(life);
  }

  /** Who of its folk wait at the camp (C11), and the take they fled. */
  private fled: { readonly event: string; readonly who: readonly Agent[] } | null = null;

  /**
   * While a band holds the place (a take), a few of its folk wait at a camp by the road outside the town they
   * fled to, one of them hurt (C11: a trace in the world, survivors to talk with); freed, they go home.
   */
  private shelter(life: TownLife): void {
    const log = this.c.log(), e = heldBy(log, this.id) ?? null, camp = this.camp(log);
    if ((e && camp ? e.id : null) === (this.fled?.event ?? null)) return;
    for (const a of this.fled?.who ?? []) life.unstation(a);
    this.fled = null;
    if (!e || !camp) return;
    const who = [...life.agents.filter((a) => a.person.role !== 'child'), ...life.agents.filter((a) => a.person.role === 'child')].filter((a) => !a.post).slice(0, CAMPED);
    who.forEach((a, k) => {
      const t = (k / who.length) * Math.PI * 2, [x, z] = onCircle(camp, t, CAMP_R);
      life.station(a, x, z, t + Math.PI, k === 0 ? 'hurt' : 'wait');
    });
    this.fled = { event: e.id, who };
  }

  /** The stray let out (C10), and whether it was caught; the clock (a game minute's step) it was looked at. */
  private strayed: string | null = null;
  private caught: string | null = null;
  private chaseKey = -1;

  /**
   * A beast out of its paddock (C10, vgm/situations.ts strayBeastFor): it wanders off, and someone of its
   * farm goes after it; once they have it, it goes back in through the gate and they go on with their day.
   */
  private chase(life: TownLife): void {
    const hours = this.c.hours(), key = Math.floor(hours * 60);
    if (key === this.chaseKey) return;
    this.chaseKey = key;
    const herds = this.herds, d = strayAt(this.c.log(), this.id, hours);
    if (!herds) return;
    const now = d && d.id !== this.caught ? d.id : null;
    if (now !== this.strayed) {
      const was = this.strayed ? this.c.log().find((x) => x.id === this.strayed) : undefined;
      if (was?.kind === 'stray') herds.loose(was.paddock, null);
      if (d && now) herds.loose(d.paddock, { x: d.x, z: d.z });
      this.strayed = now;
    }
    const beast = now ? herds.straying : null;
    if (!d || !beast) return;
    const pd = this.town.plan.paddocks[d.paddock], house = pd ? this.town.plan.farms[pd.farm]?.house : undefined;
    const farmer = life.agents.filter((a) => a.person.home === house && a.person.role !== 'child' && !a.held && !a.post)[0];
    if (!farmer) return;
    // Caught once it has got where it was going: they have it by the halter.
    if (Math.hypot(farmer.x - beast.x, farmer.z - beast.z) < 2.2 && Math.hypot(beast.x - d.x, beast.z - d.z) < 6) { this.caught = d.id; return; }
    life.seek(farmer, beast.x - Math.cos(beast.dir) * 1.2, beast.z - Math.sin(beast.dir) * 1.2, { x: beast.x, z: beast.z }, 8);
  }

  /** The traveller resting by the hero's way (C9) now, if any; the log and the clock (a minute's step) it was looked up for. */
  private resting: string | null = null;
  private restKey = '';

  /** The hurt traveller of this town resting by the way now, not yet tended (C10): their decision, or null. */
  hurtNow(): TravellerDecision | null {
    const log = this.c.log(), d = restingAt(log, this.c.hours(), this.id).at(-1);
    return d?.situation && !keptOf(log).has(d.id) ? d : null;
  }

  /** Its traveller stands where the VGM met the hero with them while that rest lasts, then is on the road again. */
  private rest(life: TownLife): void {
    const log = this.c.log(), hours = this.c.hours(), key = `${log.length}:${Math.floor(hours * 60)}`;
    if (key === this.restKey) return;
    this.restKey = key;
    const d = restingAt(log, hours, this.id).at(-1) ?? null;
    // A hurt one tended (kept) gets up and rests like any traveller.
    const hurt = !!d?.situation && !keptOf(log).has(d.id), now = d ? `${d.id}:${hurt}` : null;
    if (now === this.resting) return;
    const a = life.agents.find((x) => x.person.role === 'traveller');
    if (!a) return;
    // Facing the way the hero came from (the decision's yaw is atan2(x, z); an agent's dir is atan2(z, x)).
    if (d) life.station(a, d.x, d.z, Math.PI / 2 - d.yaw, hurt ? 'hurt' : 'wait');
    else life.unstation(a);
    this.resting = now;
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
    const t = townTalk(this.seed, this.c.setting, this.town, this.residents, log, this.saved.talk, this.world, this.c.hours()).talk;
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
    // Raiders drove some off, or they are home again (vgm/events.ts): the herds follow the log.
    const log = this.c.log();
    if (this.herdsOf && log.length !== this.herdsLog) {
      this.herdsLog = log.length;
      this.herdsOf.driven(takenFrom(log, this.id));
    }
    return this.herdsOf;
  }

  /** A promise or a story event the VGM made (already in the log): its people hear of it if it is one of theirs. */
  promised(d: Decision): void {
    if (!this.talkOf) return; // made later, the words read the log
    const log = this.c.log(), c = talkCellar(d, this.c.setting, this.town, this.residents, log);
    if (c) this.talkOf.add(c);
    const e = talkEvent(d, this.c.setting, this.town, this.residents, log, this.world, this.c.hours());
    if (e) this.talkOf.addEvent(e);
  }

  /** A story event of this town is over (its band beaten, or it ran its course): its people tell how it ended (C11). */
  ended(id: string): void {
    const log = this.c.log(), d = log.find((x) => x.id === id);
    const e = d && this.talkOf ? talkEvent(d, this.c.setting, this.town, this.residents, log, this.world, this.c.hours()) : null;
    if (e) this.talkOf?.endEvent(id, e.done);
  }

  /** What it keeps in a save (nothing if the hero never talked or traded there). */
  toSave(): TownshipSave {
    return { ...(this.been ? { been: true } : {}), ...(this.talkOf ? { talk: this.talkOf.save() } : this.saved.talk ? { talk: this.saved.talk } : {}), ...(this.marketOf ? { market: this.marketOf.save() } : this.saved.market ? { market: this.saved.market } : {}) };
  }
}
