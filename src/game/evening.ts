/**
 * The loop check (plan A6, design 11.3): a scripted hero plays an evening headless, the way a player
 * would: a new hero on the market is hailed by someone who has heard of trouble (later evenings: asks at
 * the inn for news) and hears a lead, walks there through the streets (or out over the land to a barrow), goes down and clears it with the fight bot (game/bot.ts), searches the bodies and chests,
 * climbs out, tells the household it is safe (they pay and pass on a rumour of the next lead), sells the finds, has the smith mend the gear, buys an upgrade, takes a room at
 * the inn and hears the next lead in the morning. A fall is played as designed (classic mode: the pack
 * stays where the hero fell, they wake at the inn or temple and go back for it). Every step is written to
 * the result, so a failure says where the evening broke. Pure: the land, the town, the VGM's leads, the
 * talk and the market are the game's own; only the renderer and the townsfolk walking about are left out.
 */
import { MinHeap, deriveSeed } from '@futuremagic/core';
import { polyCentroid, type SettlementSize, type TownBuilding } from '@futuremagic/settlement';
import { type GuildDef, type SettingModule } from '../setting/contract';
import { buildingOf, type Person } from '../sim/people';
import { openWorld } from '../vgm/builder';
import { regionDecisions, walkFrontier } from '../vgm/frontier';
import { houseOf, loreOf, placeOf } from '../vgm/dungeons';
import { keepPromise, nextPromise, occupationOf, openPromises } from '../vgm/leads';
import { hailer } from '../vgm/guide';
import { Director, NEEDS, type Need } from '../vgm/director';
import { answerNeed } from '../vgm/toolbox';
import { dungeonOf, settlementOf, type Decision, type DungeonDecision, type RegionDecision } from '../world/decisions';
import { moveIn, outlineCellar, type Cellar } from '../world/dungeon/cellar';
import { marketStart, type Town } from '../world/town';
import { Character } from './character';
import { fallClassic, gather, remainsId, type Remains } from './death';
import type { DelveSave } from './delve';
import { fightBot } from './bot';
import { aimsAtFoe } from './recipe';
import { defOf, type Item } from './items';
import { rewardFor } from './reward';
import { itemWorth, type Merchant } from './trade';
import { Township } from './township';
import { mendAll, takeRoom, wakePlace } from './upkeep';
import { abilityPrice, bardTells, GuildBook, teach, teachingsOf, teachRefusal } from './guilds';
import { Standing } from './standing';
import { WALK, Walker, type WalkWorld } from './walker';
import type { Terrain } from '../world/terrain';

/** One thing that happened, at a game hour (hours since the world began). */
export interface EveningStep {
  readonly hour: number;
  readonly what: string;
}

export interface EveningResult {
  /** Every evening played through. */
  readonly ok: boolean;
  /** Where it broke, if it did. */
  readonly failed: string | null;
  readonly steps: readonly EveningStep[];
  /** Promises cleared, by id. */
  readonly cleared: readonly string[];
  readonly falls: number;
  /** Copper the finds fetched, and what was bought. */
  readonly earned: number;
  readonly bought: readonly string[];
  /** Abilities learned at a guild house ("Cleave"; D59: no skills, trainers teach abilities). */
  readonly lessons: readonly string[];
  /** Per evening: copper spent on gear and abilities (the coin sink, plan A2b). */
  readonly spent: readonly number[];
  /** The purse at the end. */
  readonly purse: number;
  /** Spells that went off below (each time). */
  readonly spells: number;
  /** The hero's power at the start and at the end. */
  readonly power: readonly [number, number];
  /** The hero's level at the end (D58), and the experience earned. */
  readonly level: number;
  readonly xp: number;
  /** Simulated seconds walking and fighting. */
  readonly seconds: number;
  /** Per need of the Director (plan 4.1, C9): the longest it stood overdue, seconds of play. */
  readonly overdue: Readonly<Record<Need, number>>;
  /** What the player model made of this play at the end (C12), and how much faster Challenge grew for it. */
  readonly style: string | null;
  readonly challengeLean: number;
}

export interface EveningOptions {
  /** Evenings to play (each: a lead, the place, back, trade, a night at the inn). */
  readonly evenings?: number;
  /** Falls allowed before the check gives up. */
  readonly falls?: number;
  /** Each step as it happens. */
  readonly log?: (s: EveningStep) => void;
  /** The first time down, the hero goes in badly hurt and without potions: the check of a fall (D12, classic mode). */
  readonly reckless?: boolean;
  /**
   * Play in a settlement of this size the VGM founds out on the land (plan B3a: every town runs the same code),
   * the nearest a walk out from the start finds, as if the game began there; none: the start town.
   */
  readonly settlement?: SettlementSize;
  /** With `settlement`: a harbour town of that size (S2), else one without a harbour. */
  readonly harbour?: boolean;
  /**
   * A mage (plan C3): before the first evening the hero asks the bard where to learn, learns a first spell
   * at a teacher the bard names (mana comes with it, D59) and casts it in the first place; later evenings it
   * learns that teacher's spells as its level allows.
   */
  readonly mage?: boolean;
  /** The levels the hero must end within (D58, G1: an evening of play brings a fresh hero to level 3–5); none: any. */
  readonly levels?: readonly [number, number];
}

/** One game day takes 60 real minutes (D37): game hours per second played. */
const HOURS_PER_SECOND = 24 / 3600;
/** The game starts in the morning. */
const START_HOUR = 8;
/** The longest walk the check allows, seconds (a barrow is at most ~1.4 km out; round a mesa to its pass, some 5 km). */
const WALK_LIMIT = 1500;
/** How often the VGM looks again on a walk out on the land (s). */
const ON_WAY = 60;
/** How far along the way ahead the VGM looks for a spot by it (m). */
const AHEAD_ON_WAY = 300;
/** What a metre climbed costs the bot's way, in metres walked (a climb is slow and spends strength). */
const CLIMB_COST = 8;
/** How long one visit below may take, seconds. */
const DELVE_LIMIT = 1200;

/** Copper kept back from abilities (with the room): a mending or two. */
const LESSON_RESERVE = 40;
/** A purse above this at the end means coin piles up with nothing to buy (plan A2b). */
const SENSIBLE_PURSE = 400;

/** The longest any need of the Director may stand overdue in an evening's play, seconds (gate C, C9). */
const OVERDUE_MOST = 300;

/** A failure of the evening: thrown inside, returned as `failed`. */
class Broke extends Error {}

export function playEvening(seed: number, setting: SettingModule, opts: EveningOptions = {}): EveningResult {
  const steps: EveningStep[] = [];
  const { terrain, log: first } = openWorld(seed, setting);
  const start = terrain.towns[0];
  if (!start) throw new Error('no town to start in');
  let log: Decision[] = [...first];
  let hours = START_HOUR;
  const say = (what: string) => { const s = { hour: hours, what }; steps.push(s); opts.log?.(s); };
  const town = opts.settlement ? settlementOut(seed, setting, terrain, start, opts.settlement, !!opts.harbour, (walked) => { log = [...log, ...walked]; }) : start;
  if (town !== start) say(`plays in ${town.decision.size} ${town.decision.id}, ${Math.hypot(town.decision.x - start.decision.x, town.decision.z - start.decision.z).toFixed(0)} m from the start (${town.plan.buildings.length} buildings)`);
  // The town's core, as the game has it for every town: its people, their words, its merchants.
  const township = new Township(town, { seed, setting, log: () => log, hours: () => hours });
  const people = township.residents, talk = township.talk, market = township.market;
  const hero = new Character(setting);
  const land = new LandWalk(terrain);
  const home = marketStart(town.plan);
  land.walker.place(home.x, home.z);
  const power0 = hero.power;
  // Standing in a town for the first time is a discovery (D58), as in the game.
  hero.earn(`town:${town.decision.id}`, 'town');
  const cleared: string[] = [], bought: string[] = [], taught: string[] = [], spent: number[] = [];
  const book = new GuildBook();
  // A human hero (the creator's first people): a guild's task done is a good deed with its trainer's people (D54).
  const standing = new Standing(setting, 'human');
  let falls = 0, earned = 0, seconds = 0, spells = 0;
  /** The mage's teacher and its house. */
  let school: { house: TownBuilding; guild: GuildDef } | null = null;
  // The Director watches the evening as it would a player's (plan 4.1): where the hero is, whether they
  // have a lead to follow; play meets its needs (a fight Challenge, finds Reward, a new place Discovery,
  // the townsfolk People). How long each stands overdue is the check of C9.
  const director = new Director(setting.director);
  const watch = { where: 'town' as 'town' | 'land' | 'below', leads: 0, fighting: false };
  const overdueNow = Object.fromEntries(NEEDS.map((n) => [n, 0])) as Record<Need, number>;
  const overdue = { ...overdueNow };
  const observe = (s: number) => {
    for (let left = s; left > 0; left -= 5) {
      const dt = Math.min(5, left);
      director.observe(dt, { fighting: watch.fighting ? 1 : 0, pressure: 0, health: 1, talking: false, underground: watch.where === 'below', inTown: watch.where === 'town', leads: watch.leads });
      for (const n of NEEDS) {
        overdueNow[n] = director.needs[n] >= 1 ? overdueNow[n] + dt : 0;
        overdue[n] = Math.max(overdue[n], overdueNow[n]);
      }
    }
  };
  const pass = (s: number) => { seconds += s; hours += s * HOURS_PER_SECOND; observe(s); };
  /** The places the hero has stood before (a new one meets Discovery). */
  const seen = new Set<string>();

  /** The Builder at work (as the game's VGM tick): new promises as they come due, told to the town. */
  const promiseDue = () => {
    for (let d = vgmNext(); d; d = vgmNext()) {
      log = [...log, d];
      say(`the VGM promises ${d.kind === 'move-in' ? `new dwellers in ${d.dungeon}` : d.kind === 'dungeon' ? `${d.template} ${d.id}` : d.id}`);
      township.promised(d);
    }
  };
  // In a settlement the VGM promises from there (vgm/leads.ts `near`), as the game does while the hero is in one.
  // Its danger counts from there too, as for a hero whose game began there: a fresh hero is the check's, and
  // danger by distance from the start (D29) would make any settlement a few km out a check of luck in a fight.
  const vgmNext = () => nextPromise({ seed, log, towns: terrain.towns, home: town.decision, hours, purposeOverdue: false, inside: () => false, dungeons: setting.dungeons, terrain, near: town === start ? null : town });

  const walkTo = (what: string, x: number, z: number) => {
    const inTown = (px: number, pz: number) => Math.hypot(px - town.decision.x, pz - town.decision.z) < town.decision.radius + 60;
    const from = land.walker.pos, out = !inTown(from.x, from.z);
    watch.where = inTown(x, z) ? 'town' : 'land';
    // Out on the land on the way, whether going out or coming home from out there.
    // Every minute of the walk the VGM looks again (a long way round a mesa, D56, may need more than one answer).
    let passed = 0;
    const onWay = watch.where === 'land' || out ? (t: number, ahead: [number, number]) => { pass(t - passed); passed = t; byTheWay(ahead[0], ahead[1]); } : undefined;
    const s = land.go(x, z, onWay);
    pass(s.seconds - passed);
    if (!s.arrived) throw new Broke(`stuck on the way to ${what} at (${x.toFixed(0)}, ${z.toFixed(0)}): ${s.left.toFixed(0)} m short at (${land.walker.pos.x.toFixed(0)}, ${land.walker.pos.z.toFixed(0)})`);
    say(`walked to ${what} (${s.metres.toFixed(0)} m, ${s.seconds.toFixed(0)} s)`);
  };
  /**
   * Out on the land the VGM answers an overdue need on the way (C9): it knows where the hero is going (plan
   * 4.4), so when Discovery will fall due before they get there it puts a sight by the way, and they come
   * upon it; Reward, a find; Challenge, an ambush; People, a traveller (a long way round a mesa, D56, is long
   * enough for any). An ambush's fight is not played here (the fight bot plays the dungeons'): the check is
   * that the VGM answers.
   */
  const byTheWay = (x: number, z: number) => {
    // Every need that falls due on the way is answered at once (as the game's VGM tick does), then the hero comes
    // upon each, nearest first.
    const met: { need: Need; at: [number, number]; what: string; reason: string; sight?: string }[] = [];
    for (const need of ['discovery', 'reward', 'challenge', 'people'] as const) {
      const p = land.walker.pos, eta = Math.hypot(x - p.x, z - p.z) / WALK.run / 60;
      if (director.needs[need] + setting.director.needs[need] * director.pace * eta < 1) continue;
      const ask = () => answerNeed(need, { seed, log, terrain, towns: terrain.towns, hours, setting, hero: { x: p.x, z: p.z }, toward: { x, z } });
      let m = ask();
      // A cave opened in a cliff nearby (L6) is a place to come back to, its town's people tell of it; the way
      // on still gets its sight.
      if (m?.decision.kind === 'dungeon') {
        log = [...log, m.decision];
        township.promised(m.decision);
        say(`the VGM opens ${m.decision.id} in a cliff near the way`);
        m = ask();
      }
      const d = m?.decision;
      if (!m || !d || (d.kind !== 'sight' && d.kind !== 'wild' && d.kind !== 'traveller')) continue;
      log = [...log, d];
      const at: [number, number] = d.kind === 'wild' ? [d.x, d.z] : [d.x + Math.sin(d.yaw) * 4, d.z + Math.cos(d.yaw) * 4];
      const what = d.kind === 'sight' ? `${d.sight} (${d.id})` : d.kind === 'wild' ? `the ${d.encounter} lying in wait (${d.id})` : `a traveller resting (${d.id})`;
      met.push({ need, at, what, reason: m.reason, ...(d.kind === 'sight' ? { sight: d.id } : {}) });
    }
    while (met.length) {
      const p = land.walker.pos, far = (q: (typeof met)[number]) => Math.hypot(q.at[0] - p.x, q.at[1] - p.z);
      const next = met.reduce((a, b) => (far(b) < far(a) ? b : a));
      met.splice(met.indexOf(next), 1);
      const s = land.go(...next.at);
      pass(s.seconds);
      if (!s.arrived) throw new Broke(`stuck on the way to ${next.what}: ${s.left.toFixed(0)} m short`);
      director.met(next.need);
      // A sight found is a discovery (D58), once.
      if (next.sight) hero.earn(`sight:${next.sight}`, 'sight');
      say(`came upon ${next.what} on the way (${s.metres.toFixed(0)} m, ${s.seconds.toFixed(0)} s): ${next.reason}`);
    }
  };
  const workplace = (m: Merchant): { at: [number, number]; name: string } => workOf(people[m.person], m.shop.keeper);
  const workOf = (p: Person, keeper: string): { at: [number, number]; name: string } => {
    const b = p.work >= 0 ? town.plan.buildings[p.work] : null;
    if (b) return { at: front(b), name: `the ${keeper}'s` };
    const [x, z] = polyCentroid(town.plan.market);
    return { at: [x, z], name: `the ${keeper} at the market` };
  };
  const shops = market.merchants.length > 0;
  const merchant = (keeper: string) => market.merchants.find((m) => m.shop.keeper === keeper) ?? null;

  /** Ask around for news, the innkeeper first; the first lead heard that is still open. */
  const hearLead = (known: ReadonlySet<string>): DungeonDecision | Extract<Decision, { kind: 'move-in' }> => {
    const inn = people.find((p) => town.plan.buildings[p.work]?.kind === 'inn' && p.role === 'trade') ?? null;
    const ask = [inn, ...people.filter((p) => p !== inn && p.role !== 'child')].filter((p): p is Person => !!p);
    const open = openPromises(log);
    for (const p of ask) {
      // News, and "tell me more" while they have more to tell.
      let reply = talk.ask(p.id, 'news');
      for (let more = 0; more < 4; more++) {
        const lead = open.find((o) => !known.has(o.id) && reply.heard.includes(o.id));
        if (lead) { say(`heard of ${lead.id} from person ${p.id}${p === inn ? ' (the innkeeper)' : ''}`); return lead; }
        if (!talk.topics(p.id).some((t) => t.id === 'more')) break;
        reply = talk.ask(p.id, 'more');
      }
    }
    throw new Broke(`nobody in town tells of a new lead (open: ${open.map((o) => o.id).join(', ') || 'none'})`);
  };

  /**
   * A new hero on the market who asks nobody (vgm/guide.ts): someone who has heard of a promised place is
   * sent over (stepping out of their door), opens with a hail, and their news is the first lead.
   */
  const hailed = (): DungeonDecision | Extract<Decision, { kind: 'move-in' }> => {
    const open = openPromises(log);
    const [mx, mz] = polyCentroid(town.plan.market);
    const knows = talk.knowersOf(new Set(open.map((o) => o.id)));
    const id = hailer(people.map((p) => { const d = town.plan.buildings[p.home].door; return { id: p.id, x: d[0], z: d[1], asleep: false, busy: p.role === 'child' }; }), knows, { x: mx, z: mz });
    if (id === null) throw new Broke(`nobody who knows of a lead lives within reach of the market (${knows.size} know)`);
    talk.beckon(id, true);
    talk.greet(id);
    const reply = talk.ask(id, 'news');
    const lead = open.find((o) => reply.heard.includes(o.id));
    if (!lead) throw new Broke(`person ${id} came over to the new hero but told of no lead: "${reply.text}"`);
    say(`a new hero on the market: person ${id} comes over and tells of ${lead.id}`);
    return lead;
  };

  /** The mage asks the bard at the inn where to learn magic, walks to the first teacher named and learns a first spell. */
  const becomeMage = (): { house: TownBuilding; guild: GuildDef } => {
    const bard = township.bard, inn = buildingOf(town.plan, 'inn');
    if (!bard || !inn) throw new Broke('no bard at an inn to ask where to learn magic');
    walkTo('the inn', ...front(inn));
    const told = bardTells(setting, town.decision, township.guilds, book, (k) => { const m = people.find((p) => p.trade === k); return m ? talk.nameOf(m.id) : null; });
    const firsts = (g: GuildDef) => teachingsOf(setting, g).filter((a) => a.school && (a.level ?? 1) <= hero.level);
    const h = township.guilds.find(({ guild: g }) => firsts(g).length && book.onMap(town.decision.id, g));
    if (!h) throw new Broke(`the bard named no magic teacher (${told.length} houses)`);
    say(`asked the bard where to learn magic: ${told.find((t) => t.toLowerCase().includes(h.guild.name.toLowerCase())) ?? h.guild.name}`);
    walkTo(h.guild.name, ...front(h.b));
    // A first spell that strikes a foe, if the teacher has one (it shows magic in a fight).
    const first = firsts(h.guild).find(aimsAtFoe) ?? firsts(h.guild)[0], before = hero.coins;
    const no = teach(h.guild, hero, first, book, log);
    if (no) throw new Broke(`${h.guild.name} would not teach ${first.name}: ${no} (${hero.coins} copper)`);
    if (!hero.maxMana) throw new Broke(`learned ${first.name} but has no mana`);
    taught.push(first.name);
    say(`${h.guild.name} teaches ${first.name} for ${before - hero.coins} copper; ${hero.maxMana} mana`);
    return { house: h.b, guild: h.guild };
  };

  const heard = new Set<string>();
  /** The next lead a household passed on when told their place was safe. */
  let rumour: ReturnType<typeof openPromises>[number] | null = null;
  try {
    promiseDue();
    if (opts.mage) school = becomeMage();
    const evenings = opts.evenings ?? 1;
    for (let e = 0; e < evenings; e++) {
      say(`evening ${e + 1}: level ${hero.level} (${hero.xp} xp), power ${hero.power}, ${hero.coins} copper, ${hero.pack.length} in the pack`);
      let paid = 0;
      const fromRumour = rumour && openPromises(log).some((o) => o.id === rumour!.id) ? rumour : null;
      if (fromRumour) say(`follows the rumour of ${fromRumour.id}`);
      const lead = e === 0 ? hailed() : fromRumour ?? hearLead(heard);
      rumour = null;
      heard.add(lead.id);
      watch.leads = 1;
      director.met('purpose');
      const dungeon = dungeonOf(log, lead);
      if (!dungeon) throw new Broke(`no dungeon for ${lead.id}`);
      const place = placeOf(dungeon, terrain.towns, setting.dungeons), house = houseOf(dungeon, terrain.towns);
      if (!place || !house) throw new Broke(`${dungeon.id} has no place`);
      const lore = loreOf(setting, dungeon.template);
      const firstCellar = outlineCellar(dungeon, place, lore);
      const moved = occupationOf(log, dungeon.id);
      const cellar: Cellar = moved ? moveIn(firstCellar, moved, place, lore) : firstCellar;
      const name = `${cellar.house} (${dungeon.template}, ${cellar.dweller.id})`;
      // Out to the door above, or the barrow's mouth.
      const goDown = () => {
        if (dungeon.site) walkTo(name, dungeon.site.x - Math.sin(dungeon.site.yaw) * 2, dungeon.site.z - Math.cos(dungeon.site.yaw) * 2);
        else walkTo(name, ...front(house));
        // A new place meets Discovery; one known but changed (new dwellers moved in) half of it.
        if (!seen.has(lead.id)) { director.met('discovery', seen.has(dungeon.id) ? 0.5 : 1); seen.add(lead.id); seen.add(dungeon.id); }
        hero.earn(`place:${lead.id}`, 'place');
      };
      goDown();
      if (opts.reckless && e === 0) {
        const kept = hero.pack.filter((it) => defOf(setting.items, it.def).kind !== 'potion');
        hero.pack.length = 0;
        hero.pack.push(...kept);
        hero.health = Math.max(1, Math.round(hero.maxHealth * 0.1));
        say(`goes down reckless: ${hero.health} health, no potions`);
      }
      let saved: DelveSave | undefined;
      let left: Remains | null = null;
      for (;;) {
        const spots = left ? [{ ...left.at, reached: () => { gather(hero, left!); say(`took up the pack left at the fall (${left!.items.length} ${left!.items.length === 1 ? 'thing' : 'things'})`); left = null; } }] : [];
        const r = fightBot(cellar, setting, deriveSeed(dungeon.seed, 'visit', falls), hero, DELVE_LIMIT, { saved, loot: true, spots, rash: opts.reckless && falls === 0 && e === 0 });
        // Below: the fights and the searching spread over the visit, each meeting its need as it ends.
        watch.where = 'below';
        const parts = r.kills + r.looted + 1, cast = r.spells.length;
        // The spells spread over the fights they were cast in (a fight won with spells shows a mage).
        const casts = (n: number) => { for (let k = 0; k < n; k++) director.model.count('casts'); };
        for (let k = 0; k < parts; k++) {
          pass(r.seconds / parts);
          if (k < r.kills) {
            casts(Math.floor(((k + 1) * cast) / r.kills) - Math.floor((k * cast) / r.kills));
            director.met('challenge');
          } else if (k < parts - 1) director.met('reward', 0.4);
        }
        if (!r.kills) casts(cast);
        saved = r.delve.tally();
        spells += cast;
        if (r.won && r.out) {
          hero.earn(`cleared:${lead.id}`, 'cleared');
          say(`cleared ${name}: ${r.kills} killed, ${r.spared} spared, ${r.looted} searched, ${r.potions} potions, health ${(r.health * 100).toFixed(0)}%`);
          break;
        }
        if (r.won) throw new Broke(`beat ${name} but did not get back to the ladder in ${DELVE_LIMIT} s`);
        if (r.seconds >= DELVE_LIMIT) throw new Broke(`could not finish ${name} in ${DELVE_LIMIT} s (${r.kills} killed)`);
        // A fall, as designed: the pack stays below, the hero wakes in town and goes back for it.
        falls++;
        const fell = fallClassic(hero, { ...r.at, below: lead.id, mark: dungeon.site ?? { x: house.cx, z: house.cz }, label: `in ${cellar.house}` }, remainsId(hours), Math.floor(hours / 24));
        // A second fall before the first pack was found: one heap with both.
        if (fell.remains) left = left ? { ...fell.remains, items: [...left.items, ...fell.remains.items] } : fell.remains;
        const wake = wakePlace(hero.lodging, town.decision.id, town.plan);
        if (!wake) throw new Broke('nowhere to wake after a fall');
        say(`fell in ${name} after ${r.kills} kills; lost ${fell.lost} copper, the pack stays below; wakes at the ${wake.kind}`);
        if (falls > (opts.falls ?? 2)) throw new Broke(`fell ${falls} times in ${name}`);
        hours += 2;
        land.walker.place(...front(town.plan.buildings[wake.building]));
        // Rest before going back: a room if the purse holds one, else the night where they woke.
        const inn = town.plan.buildings[wake.building];
        if (!takeRoom(hero, hours, { town: town.decision.id, building: inn.id }, setting.upkeep)) { hero.health = hero.maxHealth; hero.stamina = hero.maxStamina; }
        hours += 8;
        goDown();
      }
      if (left) throw new Broke(`cleared ${name} but never found the pack left at the fall`);
      if (school && e === 0 && !spells) throw new Broke(`the mage cast no spell in ${name}`);
      if (school) say(`${spells} spells cast so far`);
      // Quiet, and the hero gone: back to its household to tell them (plan 4.2). They pay, the promise is
      // kept, and with the next lead already about they pass on its rumour.
      if (!talk.clear(lead.id)) throw new Broke(`${name} did not wait to be reported`);
      const to = talk.reportTo(lead.id).map((id) => people.find((p) => p.id === id)).find((p) => !!p);
      if (!to) throw new Broke(`nobody to tell that ${name} is safe`);
      walkTo(`${talk.nameOf(to.id)}'s door`, ...front(town.plan.buildings[to.home]));
      if (!talk.topics(to.id).some((t) => t.id === `report:${lead.id}`)) throw new Broke(`${talk.nameOf(to.id)} cannot be told that ${name} is safe`);
      const reward = rewardFor(cellar, setting.creatures);
      hero.coins += reward;
      const kept = keepPromise(log, lead.id, hours);
      if (kept) log = [...log, kept];
      // The household's people think better of the hero for it, once (D54).
      if (kept) { standing.keptFor(to.race, lead.id); hero.earn(`kept:${lead.id}`, 'kept'); }
      cleared.push(lead.id);
      watch.leads = 0;
      director.met('reward');
      promiseDue();
      const told = talk.toldSafe(to.id, lead.id, `paid ${reward}`);
      rumour = openPromises(log).find((o) => told.heard.includes(o.id) && !heard.has(o.id)) ?? null;
      say(`told ${talk.nameOf(to.id)} that ${name} is safe: paid ${reward} copper${rumour ? `, and heard a rumour of ${rumour.id}` : ''}`);
      if (talk.ask(to.id, 'news').heard.includes(lead.id)) throw new Broke(`${talk.nameOf(to.id)} still tells of ${name} after hearing it is safe`);

      // Back in town: sell, mend, upgrade. A town without shops (a hamlet) has nobody to trade with; one
      // with any has a smith.
      const smith = merchant('smith'), trader = merchant('trader'), keeper = merchant('innkeeper');
      if (shops && !smith) throw new Broke('no smith in town');
      const finds = hero.pack.filter((it) => defOf(setting.items, it.def).slot || defOf(setting.items, it.def).value > 0);
      say(`brought back ${finds.length} finds and ${hero.coins} copper`);
      // Writings found below are read before anything is sold (C3: a rare extra way to a spell).
      for (const it of hero.pack.filter((x) => defOf(setting.items, x.def).teaches)) {
        const d = defOf(setting.items, it.def);
        if (!hero.readWriting(it)) say(`read ${d.name}: knows ${d.teaches} now`);
      }
      const sellAt = (m: Merchant | null) => {
        if (!m) return 0;
        const w = workplace(m);
        walkTo(w.name, ...w.at);
        let got = 0;
        for (const it of [...hero.pack]) {
          if (keepIt(it)) continue;
          const price = market.pays(m, it, hero.speech);
          if (price > 0 && !market.sell(hero, m, it)) got += price;
        }
        if (got) say(`sold to ${w.name} for ${got} copper`);
        return got;
      };
      // Potions and food stay in the pack for the next place.
      const keepIt = (it: Item) => ['potion', 'food'].includes(defOf(setting.items, it.def).kind);
      earned += sellAt(smith);
      const mend = smith ? mendAll(hero, (it) => itemWorth(setting.items, it), setting.upkeep) : { mended: [], spent: 0 };
      if (mend.mended.length) say(`the smith mends ${mend.mended.length} things for ${mend.spent} copper`);
      earned += sellAt(trader);
      if (keeper) earned += sellAt(keeper);
      // Abilities first, with what is left above a night's room and a mending (D59; gear takes the rest): at each guild house on the map, the
      // cheapest first; a mage keeps to its teacher's spells and the fighting houses' arts, a fighter to the arts.
      const reserve = setting.upkeep.room + LESSON_RESERVE;
      for (const h of [...township.guilds].sort((x, y) => Number(y.guild === school?.guild) - Number(x.guild === school?.guild))) {
        const g = h.guild;
        if (!book.onMap(town.decision.id, g)) continue;
        if (book.thank(g, log)) { standing.deed(`task:${g.keeper}`, 'human', setting.standing.task); hero.earn(`task:${g.keeper}`, 'task'); say(`${g.name} thanks the hero for its task`); }
        const fit = teachingsOf(setting, g).filter((a) => (school ? !a.school || g === school.guild : !a.school))
          .sort((a, b) => abilityPrice(g, a) - abilityPrice(g, b));
        let walked = false;
        for (const a of fit) {
          const no = teachRefusal(g, hero, a, book, log);
          // A dearer ability waits for the guild's task: the trainer gives it, and a promise kept does it.
          if (no === 'task' && !book.asked(g.keeper)) { book.assign(g.keeper, hours); say(`${g.name} asks its task`); }
          if (no || hero.coins - abilityPrice(g, a) < reserve) continue;
          if (!walked) { walkTo(g.name, ...front(h.b)); walked = true; }
          const before = hero.coins;
          teach(g, hero, a, book, log);
          paid += before - hero.coins;
          hours += g.hours;
          taught.push(a.name);
          say(`${g.name} teaches ${a.name} (level ${a.level ?? 1}) for ${before - hero.coins} copper`);
        }
      }
      // The best upgrade the purse allows, at the smith's (and the market's).
      for (const m of [smith, trader]) {
        if (!m) continue;
        const up = market.upgradeFor(hero, m);
        if (!up) continue;
        const w = workplace(m);
        walkTo(w.name, ...w.at);
        const was = hero.power;
        const before = hero.coins;
        if (market.buy(hero, m, up.item)) continue;
        paid += before - hero.coins;
        hero.equip(up.item);
        bought.push(up.item.name);
        say(`bought ${up.item.name} from the ${m.shop.keeper}: power ${was} -> ${hero.power}`);
        break;
      }
      spent.push(paid);
      if (shops && e > 0 && !paid && !spent[e - 1]) throw new Broke(`two evenings with nothing bought and no ability learned (${hero.coins} copper)`);
      // A room for the night, and the next morning's news.
      // A town without an inn (a hamlet): the night at home in the household's barn or by the hearth.
      const innB = buildingOf(town.plan, 'inn');
      if (!innB && shops) throw new Broke('no inn in town');
      if (innB) walkTo('the inn', ...front(innB));
      const night = innB ? takeRoom(hero, hours, { town: town.decision.id, building: innB.id }, setting.upkeep) : null;
      if (!innB) { say('no inn here: sleeps in a barn'); hours += 10; hero.health = hero.maxHealth; hero.stamina = hero.maxStamina; }
      else if (night) { say(`took a room for ${night.paid} copper; wakes at ${(night.wake % 24).toFixed(0)}:00 on day ${Math.floor(night.wake / 24)}`); hours = night.wake; }
      else { say(`too poor for a room (${hero.coins} copper)`); hours += 10; }
      market.restock(Math.floor(hours / 24));
      promiseDue();
    }
    if (opts.reckless && !falls) throw new Broke('went down reckless and did not fall');
    const lv = opts.levels;
    if (lv && (hero.level < lv[0] || hero.level > lv[1])) throw new Broke(`ended at level ${hero.level} (${hero.xp} xp), not ${lv[0]}–${lv[1]}`);
    if (setting.guilds?.length && township.guilds.length && !taught.length) throw new Broke(`learned no ability at a guild house in ${evenings} evenings`);
    if (shops && !bought.length) throw new Broke(`bought no upgrade in ${evenings} evenings (${hero.coins} copper left)`);
    if (shops && hero.coins > SENSIBLE_PURSE) throw new Broke(`${hero.coins} copper piled up with nothing to spend it on (at most ${SENSIBLE_PURSE})`);
    // Gate C (C9): the VGM answers every need; none stands overdue longer than OVERDUE_MOST.
    for (const n of NEEDS) if (overdue[n] > OVERDUE_MOST) throw new Broke(`${n} stood overdue ${(overdue[n] / 60).toFixed(1)} min (at most ${OVERDUE_MOST / 60})`);
    // The next lead: someone has news of a place not yet visited.
    const next = hearLead(heard);
    say(`the next lead is ${next.id}`);
  } catch (e) {
    if (!(e instanceof Broke)) throw e;
    say(`BROKE: ${e.message}`);
    return { ok: false, failed: e.message, steps, cleared, falls, earned, bought, lessons: taught, spent, purse: hero.coins, power: [power0, hero.power], level: hero.level, xp: hero.xp, seconds, spells, overdue, style: director.model.style, challengeLean: director.model.lean('challenge') };
  }
  return { ok: true, failed: null, steps, cleared, falls, earned, bought, lessons: taught, spent, purse: hero.coins, power: [power0, hero.power], level: hero.level, xp: hero.xp, seconds, spells, overdue, style: director.model.style, challengeLean: director.model.lean('challenge') };
}

/** A point just outside a building's door. */
function front(b: TownBuilding): [number, number] {
  return [b.door[0] - b.vx * 1.2, b.door[1] - b.vz * 1.2];
}

/**
 * Walks out from the start until the VGM founds a settlement of `size` (the frontier, as the hero walks in
 * the game), settles it on the land and hands the regions opened on the way to `opened` (for the log).
 */
function settlementOut(seed: number, setting: SettingModule, terrain: Terrain, start: Town, size: SettlementSize, harbour: boolean, opened: (walked: Decision[]) => void): Town {
  const regions = setting.regions;
  if (!regions) throw new Error('the setting opens no regions: no settlement to play in');
  const wanted = (d: RegionDecision) => { const t = settlementOf(d, regions.fills); return t?.size === size && !!t.harbour === harbour; };
  // The nearest one a walk out finds, whichever way (danger grows with distance, D29).
  let best: { walked: RegionDecision[]; found: RegionDecision; d: number } | null = null;
  for (let dir = 0; dir < 8; dir++) {
    const walked = walkFrontier({ seed, log: [start.decision], terrain, regions, home: start.decision }, (dir * Math.PI) / 4, 8, wanted);
    const found = regionDecisions(walked).find(wanted);
    const d = found?.site ? Math.hypot(found.site.x - start.decision.x, found.site.z - start.decision.z) : Infinity;
    if (found && (!best || d < best.d)) best = { walked, found, d };
  }
  if (best) {
    opened(best.walked);
    terrain.settleMore(best.walked);
    const town = terrain.town(best.found.id);
    if (town) return town;
  }
  throw new Error(`no ${harbour ? 'harbour ' : ''}${size} found within 8 km of the start`);
}

/** How often a walk finds its way again from where it got stuck. */
const REPLANS = 4;
/** Looks along a move between metre cells for a step too high to walk. */
const STEP_LOOKS = 4;

/** The hero's body walking the land and its towns (the game's walk world without the townsfolk and trees). */
export class LandWalk {
  readonly walker: Walker;
  /** Metres climbed on rock faces so far (D56). */
  climbed = 0;
  /**
   * `climb`: the bot knows the stretches of a mesa's walls with holds (D56) and climbs them where that is the
   * shorter way; else it keeps to the passes.
   */
  constructor(private readonly terrain: Terrain, private readonly climb = false) {
    const world: WalkWorld = {
      height: (x, z) => terrain.height(x, z),
      floor: (x, z) => standAt(terrain, x, z),
      rockSurface: (x, y, z) => terrain.rockSurface(x, y, z),
      waterLevel: (x, z) => { const h = terrain.height(x, z), d = terrain.waterDepth(x, z, h); return d > 0.4 ? h + d : null; },
      wall: (x, z, r) => solidAt(terrain, x, z, r),
      ...(climb ? { climbable: (x: number, z: number) => terrain.climbable(x, z) } : {}),
    };
    this.walker = new Walker(world);
  }

  /** Walk to (x, z) the way `findWay` finds. */
  go(x: number, z: number, onWay?: (seconds: number, ahead: [number, number]) => void): { arrived: boolean; seconds: number; metres: number; left: number } {
    const w = this.walker, p = w.pos;
    const pts = this.findWay(p.x, p.z, x, z);
    const dt = 0.1;
    let t = 0, metres = 0, check = { x: p.x, z: p.z, t: 0 }, side = 1;
    let detour: [number, number] | null = null, onFace = false;
    let replans = 0;
    // The VGM looks along the way (round an estuary or a mesa it is not the goal's way): as the walk sets off, and
    // every ON_WAY seconds of it.
    const look = () => {
      if (!onWay) return;
      const ox = p.x, oz = p.z;
      // Where the way leads a few hundred metres on.
      let ahead = pts[pts.length - 1] ?? [x, z], run = 0;
      for (let i = 0, [qx, qz] = [p.x, p.z]; i < pts.length; i++) { run += Math.hypot(pts[i][0] - qx, pts[i][1] - qz); [qx, qz] = pts[i]; if (run > AHEAD_ON_WAY) { ahead = pts[i]; break; } }
      onWay(t, ahead);
      // Turned aside (to a sight, an ambush): on from the nearest point of the way at the same height (not one
      // up on a plateau beside it), or a way found afresh.
      if (Math.hypot(p.x - ox, p.z - oz) > 1) {
        let k = -1, best = 60;
        for (let i = 0; i < pts.length; i++) {
          const d = Math.hypot(pts[i][0] - p.x, pts[i][1] - p.z);
          if (d < best && Math.abs(this.terrain.height(pts[i][0], pts[i][1]) - p.y) < 3) { best = d; k = i; }
        }
        if (k >= 0) pts.splice(0, k);
        else pts.splice(0, pts.length, ...this.findWay(p.x, p.z, x, z));
        detour = null;
        check = { x: p.x, z: p.z, t };
      }
    };
    look();
    while (pts.length && t < WALK_LIMIT) {
      const [tx, tz]: [number, number] = detour ?? pts[0];
      const dx: number = tx - p.x, dz: number = tz - p.z, d = Math.hypot(dx, dz);
      if (d < (detour ? 0.8 : pts.length === 1 ? 0.6 : 1.2)) { if (detour) detour = null; else pts.shift(); continue; }
      const bx = p.x, bz = p.z, by = p.y;
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-dx, -dz), walk: false, up: false, down: false }, dt);
      // On a face: up it hand over hand, and over the top.
      if (w.mode === 'climb' || w.mode === 'pull') {
        if (w.mode === 'climb') this.climbed += Math.max(0, p.y - by);
        t += dt;
        check = { x: p.x, z: p.z, t };
        onFace = true;
        continue;
      }
      // Over the top: on from the first point of the way up here (those on the face are passed).
      if (onFace) {
        onFace = false;
        const k = pts.findIndex(([qx, qz]) => this.terrain.height(qx, qz) > p.y - 2);
        pts.splice(0, k < 0 ? pts.length - 1 : k);
      }
      metres += Math.hypot(p.x - bx, p.z - bz);
      t += dt;
      if (Math.floor(t / ON_WAY) > Math.floor((t - dt) / ON_WAY)) look();
      // No headway for a while (a slope, a rock): step aside and hop, alternating sides, further each time.
      if (t - check.t > 1.5) {
        if (Math.hypot(p.x - check.x, p.z - check.z) < 1 && Math.abs(side) > 6 && replans < REPLANS) {
          // Hopped aside long enough: off the way found (slid down a slope beside it): a way from here.
          pts.splice(0, pts.length, ...this.findWay(p.x, p.z, x, z));
          replans++; side = 1; detour = null;
        } else if (Math.hypot(p.x - check.x, p.z - check.z) < 1) {
          const n: number = Math.hypot(dx, dz) || 1, reach = 3 + 2 * Math.min(4, Math.abs(side));
          detour = [p.x - (dz / n) * reach * Math.sign(side) - (dx / n), p.z + (dx / n) * reach * Math.sign(side) - (dz / n)];
          side = -side + Math.sign(-side);
          w.step({ forward: 1, strafe: 0, heading: Math.atan2(-dx, -dz), walk: false, up: true, down: false }, dt);
        }
        check = { x: p.x, z: p.z, t };
      }
    }
    const left = Math.hypot(x - p.x, z - p.z);
    return { arrived: left < 2, seconds: t, metres, left };
  }

  /**
   * Waypoints from (ax, az) to (bx, bz), as a player steers: A* over 1 m cells of the ground near the
   * straight way, round walls and fences, not up slopes too steep to climb, wading and swimming only where
   * it must. When that finds no way (a mesa's wall between, D56), the same over 4 m cells kilometres round,
   * to the nearest pass. Cells are looked at only as the search reaches them.
   */
  private findWay(ax: number, az: number, bx: number, bz: number): [number, number][] {
    const near = this.search(ax, az, bx, bz, 1, 120);
    if (near) return near;
    const far = this.search(ax, az, bx, bz, 4, 3000);
    if (!far) return [[bx, bz]];
    // The coarse way in legs of some 60 m, each found again over metre cells (fences and walls a 4 m cell misses).
    const out: [number, number][] = [];
    let [px, pz] = [ax, az];
    for (let k = 14; k < far.length + 14; k += 15) {
      const [qx, qz] = far[Math.min(k, far.length - 1)];
      const leg = this.search(px, pz, qx, qz, 1, 30) ?? this.search(px, pz, qx, qz, 1, 150) ?? far.slice(k - 14, k + 1);
      out.push(...leg);
      [px, pz] = [qx, qz];
    }
    return out;
  }

  /** Can the bot climb from cell `c` up into cell `n`: a face with holds between them? */
  private holds(c: number, n: number, centre: (c: number) => [number, number]): boolean {
    if (!this.climb) return false;
    const [ax, az] = centre(c), [bx, bz] = centre(n);
    return this.terrain.climbable((ax + bx) / 2, (az + bz) / 2) !== null && this.terrain.climbable(bx, bz) !== null;
  }

  /** A* over cells of `size` metres in the box round both ends, `M` metres wider; null when there is no way. */
  private search(ax: number, az: number, bx: number, bz: number, size: number, M: number): [number, number][] | null {
    const x0 = Math.floor(Math.min(ax, bx) - M), z0 = Math.floor(Math.min(az, bz) - M);
    const nx = Math.ceil((Math.max(ax, bx) + M - x0) / size), nz = Math.ceil((Math.max(az, bz) + M - z0) / size), N = nx * nz;
    const { terrain } = this;
    const cellCentre = (c: number): [number, number] => [x0 + ((c % nx) + 0.5) * size, z0 + (Math.floor(c / nx) + 0.5) * size];
    // Per cell, once: its height, and 1 free / 2 wall / 3 water.
    const hs = new Float32Array(N), kind = new Uint8Array(N), steep = new Uint8Array(N);
    const look = (c: number) => {
      if (kind[c]) return;
      const [x, z] = cellCentre(c);
      hs[c] = terrain.height(x, z);
      // A coarse cell on a step or a wall is shut: its neighbours alone would not see a short sheer drop.
      const sheer = size > 1 && Math.max(Math.abs(terrain.height(x + 1, z) - terrain.height(x - 1, z)), Math.abs(terrain.height(x, z + 1) - terrain.height(x, z - 1))) / 2 > WALK.maxSlope * 0.8;
      // Rock of a volume (a cave's hill, a tower's crag) standing on the ground there is a wall too.
      const rock = terrain.rockSurface(x, hs[c] + 1, z);
      kind[c] = (sheer && !(this.climb && terrain.climbable(x, z))) || (rock !== null && rock < WALK.radius) || solidAt(terrain, x, z, WALK.radius + 0.25) ? 2 : terrain.waterDepth(x, z, hs[c]) > 0.4 ? 3 : 1;
    };
    // The ground's own slope at a cell, looked at once when a way up into it is asked (1 steep, 2 not).
    const steepAt = (c: number) => {
      if (!steep[c]) { const [x, z] = cellCentre(c); steep[c] = Math.hypot(terrain.height(x + 0.4, z) - terrain.height(x - 0.4, z), terrain.height(x, z + 0.4) - terrain.height(x, z - 0.4)) / 0.8 > WALK.maxSlope * 0.8 ? 1 : 2; }
      return steep[c] === 1;
    };
    // A step up between two cells too high to walk (a bank's edge between their centres, which their own slopes miss).
    const stepUp = (c: number, n: number) => {
      const [cx, cz] = cellCentre(c), [qx, qz] = cellCentre(n);
      let h = hs[c];
      for (let k = 1; k <= STEP_LOOKS; k++) {
        const g = terrain.height(cx + ((qx - cx) * k) / STEP_LOOKS, cz + ((qz - cz) * k) / STEP_LOOKS);
        if (g - h > WALK.step * 0.9) return true;
        h = g;
      }
      return false;
    };
    const cell = (x: number, z: number) => Math.floor((x - x0) / size) + Math.floor((z - z0) / size) * nx;
    const a = cell(ax, az), b = cell(bx, bz);
    const g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const [gx, gz] = cellCentre(b);
    const toGoal = (c: number) => { const [x, z] = cellCentre(c); return Math.hypot(x - gx, z - gz); };
    const open = new MinHeap();
    g[a] = 0;
    look(a);
    open.push(toGoal(a), a);
    while (open.size) {
      const c = open.pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === b) break;
      const i = c % nx, j = Math.floor(c / nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const n = ii + jj * nx;
        look(n);
        // The goal's own cell may touch a wall (before a door); corners are not cut.
        if (kind[n] === 2 && n !== b) continue;
        if (di && dj) { look(i + di + j * nx); look(i + (j + dj) * nx); if (kind[i + di + j * nx] === 2 || kind[i + (j + dj) * nx] === 2) continue; }
        const run = (di && dj ? Math.SQRT2 : 1) * size;
        // Too steep to walk up: as the walker has it, by the step and by the ground's own slope (no zigzag).
        // Nor down what could not be walked up again (a drop into a basin walled all round leaves the bot there).
        const rise = (hs[n] - hs[c]) / run, fall = -rise;
        const up = rise > WALK.maxSlope * 0.8 || (rise > WALK.maxSlope * 0.25 && size === 1 && (steepAt(n) || stepUp(c, n)));
        if (up && !this.holds(c, n, cellCentre)) continue;
        if (fall > WALK.maxSlope * 0.8 || (fall > WALK.maxSlope * 0.25 && size === 1 && steepAt(c))) continue;
        const cost = g[c] + run * (kind[n] === 3 ? 3 : 1) + (up ? (hs[n] - hs[c]) * CLIMB_COST : 0);
        if (cost < g[n]) { g[n] = cost; from[n] = c; open.push(cost + toGoal(n), n); }
      }
    }
    if (from[b] < 0 && a !== b) return null;
    const cells: number[] = [];
    for (let c = b; c !== a && c >= 0; c = from[c]) cells.push(c);
    // Every third metre-cell is enough to steer by (every coarse one), and every cell where the way turns (the
    // straight line from one kept cell to the next cut a house's corner, and the bot stood pressed against it);
    // the end itself last.
    const every = size > 1 ? 1 : 3;
    cells.reverse();
    const turns = (k: number) => k > 0 && k < cells.length - 1 && cells[k] - cells[k - 1] !== cells[k + 1] - cells[k];
    const out = cells.filter((_, k) => k % every === every - 1 || turns(k)).map(cellCentre);
    out.push([bx, bz]);
    return out;
  }
}

/** Does a body of radius `r` at (x, z) touch any town's walls or fences? */
function solidAt(terrain: Terrain, x: number, z: number, r: number): boolean {
  for (const t of terrain.towns) if (t.solid(x, z, r)) return true;
  return false;
}

/** The highest step or porch floor of any town at (x, z) (null: none). */
function standAt(terrain: Terrain, x: number, z: number): number | null {
  for (const t of terrain.towns) { const h = t.stand(x, z); if (h !== null) return h; }
  return null;
}
