/**
 * Talking with the townsfolk (plan 9.1, D36): topic-based dialogue through Arnd's Conversations package.
 * Every townsperson is a character with their own evidence; the VGM's hints (vgm/hints.ts) go in as what
 * the household has seen themselves and as hearsay passed on to the inn and the neighbours. The player
 * picks a topic, the person answers from what they know, and hearing of a promised cellar is the
 * commitment signal (plan 4.2) the journal and the map pick up. Pure: no DOM, no three.js.
 */
import { AgentCore, characterFromProfile, createSettingSession, hearResponse, type Act, type Atom, type Domain, type Fact, type Plan, type Profile, type SettingSession, type SettingSnapshot } from 'solarpolis-dialogue';
import { createEnglishResources, englishModule, type EnglishResources } from 'solarpolis-dialogue/english';
import { hash2f } from '@futuremagic/core';
import type { SettingModule, TalkDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { loreOf, placeOf } from '../vgm/dungeons';
import { cellarHint, type CellarHint } from '../vgm/hints';
import { dungeonOf, type Decision, type DecisionLog } from '../world/decisions';
import { sketchCellar, type CellarSketch } from '../world/dungeon/cellar';
import type { Town } from '../world/town';
import { cap, fill, nameFolk, type Folk } from './folk';

/** A promised cellar as the townsfolk know it. */
export interface TalkCellar {
  readonly sketch: CellarSketch;
  readonly hint: CellarHint;
}

export interface Topic {
  readonly id: string;
  readonly label: string;
  /** A topic about a lead the player follows (it glows in the dialogue). */
  readonly lead?: boolean;
}

/**
 * Something a townsperson does for the hero besides talk (trade, a repair, a room): a topic of its own
 * whose answer opens the game's window for it instead of asking the dialogue engine.
 */
export interface Service {
  /** Topic id; the reply's `opens`. */
  readonly id: string;
  readonly label: string;
  /** What they say as it opens. */
  readonly line: string;
}

export interface Reply {
  readonly text: string;
  /** A service's id: the game opens its window (the talk ends). */
  readonly opens?: string;
  /** Cellars (decision ids) this answer told the player about, and who told. */
  readonly heard: readonly string[];
  /** The promise the hero just told this household was kept (its place is safe again). */
  readonly reported?: string;
  /** The conversation is over (farewell). */
  readonly done: boolean;
}

/**
 * How a townsperson's people stand with the hero (plan 11.6), as the game reads it: how they greet them
 * (null: the talk's own greeting), whether they will not talk at all, and what they say instead of their
 * news when they do not care to share it (null: they share).
 */
export interface Manner {
  readonly greet: string | null;
  readonly refuse: boolean;
  readonly curt: string | null;
}

const TEMPERAMENTS = ['warm', 'reserved', 'curious', 'dry', 'lively'] as const;
const pid = (id: number) => `p${id}`;
/** Lines arrive as sentences; the realizer adds its own capital and full stop (and quotes them mid-sentence). */
const clause = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/[.!]\s*$/, '');
export { cap };

export class TownTalk {
  private session!: SettingSession;
  private readonly cellars: TalkCellar[];
  private readonly byId = new Map<number, Folk>();
  /** Lead topics the player can ask about (cellar ids), in the order heard. */
  private readonly leads: string[] = [];
  private readonly cellarName = new Map<string, string>();
  private readonly cellarHouse = new Map<string, { building: number; name: string; dungeon: string; site?: { x: number; z: number } }>();
  /** Turns asked per person (to vary the "nothing" lines). */
  private readonly turns = new Map<number, number>();
  /** What each person last told (so "How do you know?" asks about that alone). */
  private readonly told = new Map<number, Atom>();
  /** People who know the hero from before (plan 11.4), and how they greet them. */
  private readonly friends = new Map<number, string>();
  /** Sent over to the hero by the guide (vgm/guide.ts): they open with a hail, and their news glows. */
  private readonly beckoned = new Set<number>();
  /** What each person offers besides talk (set by the game: trade, repairs, a room). */
  services: (person: number) => readonly Service[] = () => [];
  /** Promises whose place has gone quiet, waiting for the hero to tell their household (plan 4.2). */
  private readonly quiet = new Set<string>();
  /** Promises kept: the household was told, and nobody speaks of the trouble any more. */
  private readonly settled = new Set<string>();
  /** How each person's people stand with the hero (set by the game; none: as with any stranger). */
  manner: (person: Person) => Manner | null = () => null;

  private mannerOf(person: number): Manner | null {
    const f = this.byId.get(person);
    return f ? this.manner(f.person) : null;
  }

  constructor(private readonly folk: readonly Folk[], private readonly talk: TalkDef, cellars: readonly TalkCellar[], saved?: TownTalkSave) {
    for (const f of folk) this.byId.set(f.person.id, f);
    this.cellars = [...cellars];
    this.open(saved?.session);
    if (saved) {
      this.leads.push(...saved.leads.filter((l) => this.cellarName.has(l)));
      for (const id of saved.settled ?? []) this.settled.add(id);
      for (const id of saved.quiet ?? []) if (!this.settled.has(id)) this.quiet.add(id);
    } else this.spread(this.cellars);
  }

  /**
   * A cellar promised while playing (the Builder's next lead, plan 4.2): the townsfolk learn of it as if
   * it had been there from the start, and the household tells it around.
   */
  add(cellar: TalkCellar): void {
    if (this.cellarName.has(cellar.hint.cellar)) return;
    this.cellars.push(cellar);
    this.open(this.session.snapshot());
    this.spread([cellar]);
  }

  /** The household has told some of it around: the inn and a neighbour or two heard that something is wrong. */
  private spread(cellars: readonly TalkCellar[]): void {
    for (const { hint } of cellars) for (const t of hint.told) {
      const plan = this.session.core.respond(pid(t.from), { function: 'ask', query: { predicate: 'troubled', args: { subject: hint.cellar } }, speaker: pid(t.to) });
      hearResponse(this.session.core, pid(t.from), pid(t.to), plan);
    }
  }

  /**
   * The talk's session from the folk and the cellars; a saved state carries over. Each cellar added is a
   * new version of the domain, so an older state takes in the new cellars' facts (Conversations' migration).
   */
  private open(saved?: SettingSnapshot): void {
    const { folk, talk, cellars } = this;
    const entities: Record<string, { type: string }> = {};
    const names: Record<string, string> = {};
    const social: Record<string, Record<string, unknown>> = {};
    const voices: Record<string, Record<string, unknown>> = {};
    const characters = folk.map((f) => {
      const p = f.person;
      const profile: Profile = { id: pid(p.id), temperament: TEMPERAMENTS[Math.floor(hash2f(p.seed, 1, 2) * TEMPERAMENTS.length)] };
      entities[pid(p.id)] = { type: 'person' };
      names[pid(p.id)] = f.name;
      voices[pid(p.id)] = {};
      social[pid(p.id)] = {
        identity: fill(talk.identity[p.role] ?? talk.identity.homemaker, { name: f.name, trade: p.trade, house: f.house }),
        sourceReply: 'I know it from {source}: {claim}.',
      };
      // The household's own source reads as their own house.
      return { ...characterFromProfile(profile), voice: pid(p.id), personality: { detail: 1, testimony: 'provisional' as const, affiliation: 0.9 } };
    });
    const facts: Fact[] = [];
    for (const { sketch, hint } of cellars) {
      const id = hint.cellar;
      const teller = folk.find((f) => f.person.home === hint.building);
      const house = teller?.house ?? sketch.house;
      const name = sketch.called ?? fill(talk.cellar, { house });
      this.cellarName.set(id, name);
      this.cellarHouse.set(id, { building: hint.building, name: sketch.called ?? house, dungeon: sketch.decision.id, ...(sketch.site ? { site: sketch.site } : {}) });
      entities[id] = { type: 'place' };
      names[id] = name;
      const knownBy = hint.knowers.map(pid);
      const fact = (n: string, atom: Fact['atom']): Fact => ({ id: `${id}/${n}`, atom, validFrom: 0, validTo: null, knownBy, sourceKey: 'source.house', origin: { kind: 'vgm', promise: id } });
      facts.push(fact('troubled', { predicate: 'troubled', args: { subject: id } }));
      sketch.hints.forEach((h, i) => facts.push(fact(`sign-${i}`, { predicate: 'noticed', args: { subject: id, sign: clause(h) } })));
      sketch.history.filter((h) => h.layer === 'built' || h.layer === 'older').forEach((h, i) => facts.push(fact(`story-${i}`, { predicate: 'story', args: { subject: id, line: clause(h.text) } })));
    }
    const resources: EnglishResources = {
      ...createEnglishResources({
        entities: names,
        predicates: {
          troubled: { positive: talk.troubled, negative: `nothing is wrong in {subject}` },
          noticed: { positive: '{sign}' },
          story: { positive: '{line}' },
        },
      }),
      voices,
      social,
      sources: { 'source.house': talk.ownHouse },
    };
    // One version per cellar known, counting from 1 with none (a town whose first cellar comes later, plan B3a).
    const version = cellars.length + 1;
    const domain: Domain = {
        version,
        migrateFrom: Array.from({ length: version - 1 }, (_, i) => i + 1),
        entities,
        predicates: {
          troubled: { roles: { subject: 'entity' }, keyRoles: ['subject'] },
          noticed: { roles: { subject: 'entity', sign: 'string' }, keyRoles: ['subject', 'sign'] },
          story: { roles: { subject: 'entity', line: 'string' }, keyRoles: ['subject', 'line'] },
        },
        characters,
        facts,
      };
    // A state from before the latest cellars: its people take in the new facts (Conversations' own migration).
    const state = saved && saved.domainVersion !== version ? { ...saved, domainVersion: version, core: new AgentCore(domain, saved.core).snapshot() } : saved;
    this.session = createSettingSession({ contractVersion: 1, id: 'masterworld-town', domain, languages: { en: resources } }, { languageModule: englishModule, saved: state });
  }

  /** The person's name. */
  nameOf(person: number): string { return this.byId.get(person)?.name ?? '?'; }

  /** Where the person lives, as people call it ("the inn of the Hollin family"). */
  homeCalled(person: number): string { return this.byId.get(person)?.house ?? '?'; }

  /** What a cellar is called in talk ("the cellar under the cottage of the Hollin family"). */
  cellarCalled(id: string): string { return this.cellarName.get(id) ?? id; }

  /** The building a cellar lies under (index into the town plan), and what it is called. */
  houseOf(id: string): number { return this.cellarHouse.get(id)?.building ?? -1; }
  houseCalled(id: string): string { return this.cellarHouse.get(id)?.name ?? id; }

  /** A barrow's doorway on the land (the map marks it); null for a cellar (its house's door is marked). */
  siteOf(id: string): { readonly x: number; readonly z: number } | null { return this.cellarHouse.get(id)?.site ?? null; }

  /** Who has heard of any of these promises (first-hand or told), by person id. */
  knowersOf(ids: ReadonlySet<string>): Set<number> {
    const out = new Set<number>();
    for (const { hint } of this.cellars) {
      if (!ids.has(hint.cellar) || this.quiet.has(hint.cellar) || this.settled.has(hint.cellar)) continue;
      for (const k of hint.knowers) out.add(k);
      for (const t of hint.told) out.add(t.to);
    }
    return out;
  }

  /**
   * The place of a promise has gone quiet (its dwellers are gone and the hero has left): its household
   * can be told. True when this is news (not already quiet or kept).
   */
  clear(id: string): boolean {
    if (!this.cellarName.has(id) || this.quiet.has(id) || this.settled.has(id)) return false;
    this.quiet.add(id);
    return true;
  }

  /** Quiet and not yet told to its household. */
  isQuiet(id: string): boolean { return this.quiet.has(id); }

  /** Kept: the household knows it is safe again. */
  isSettled(id: string): boolean { return this.settled.has(id); }

  /** Who is told a promise's place is safe again: the household (with none grown, whoever they had told). */
  reportTo(id: string): readonly number[] {
    const hint = this.cellars.find((c) => c.hint.cellar === id)?.hint;
    if (!hint) return [];
    return hint.knowers.length ? hint.knowers : hint.told.map((t) => t.to);
  }

  /**
   * The promise kept (told to its household, or kept before this was asked): everyone who knew of the
   * trouble now knows it is over, so its hint lines stop and its lead is no longer a topic.
   */
  hush(id: string): void {
    this.quiet.delete(id);
    if (this.settled.has(id) || !this.cellarName.has(id)) return;
    this.settled.add(id);
    const hint = this.cellars.find((c) => c.hint.cellar === id)!.hint;
    const observers = [...new Set([...hint.knowers, ...hint.told.map((t) => t.to)])].map(pid);
    this.session.core.applyEvent({ id: `settled/${id}`, changes: [{ atom: { predicate: 'troubled', args: { subject: id }, polarity: false } }], observers, origin: { kind: 'vgm', promise: id } });
  }

  /**
   * The hero tells `person` the place of promise `id` is safe again: the promise is kept, and they say
   * `thanks` (the game pays). With a lead the hero has not heard of yet, they pass on its rumour (the
   * journal and the map take it up as any lead heard).
   */
  toldSafe(person: number, id: string, thanks: string): Reply {
    this.hush(id);
    this.beckoned.delete(person);
    const next = this.rumour(person, id);
    return { text: next ? `${thanks} ${this.talk.cleared.rumour} ${next.text}` : thanks, heard: next ? next.heard : [], done: false, reported: id };
  }

  /** A lead the hero has not heard of, as `person` tells it (first-hand, or as hearsay passed to them now); null: none open. */
  private rumour(person: number, except: string): Reply | null {
    const open = this.cellars.filter(({ hint }) => {
      const id = hint.cellar;
      return id !== except && !this.settled.has(id) && !this.quiet.has(id) && !this.leads.includes(id);
    });
    // The newest promise first (what has just come up is what people talk of).
    const pick = open[open.length - 1];
    if (!pick) return null;
    const id = pick.hint.cellar;
    if (!pick.hint.knowers.includes(person)) {
      const from = pick.hint.knowers[0] ?? pick.hint.told[0]?.from;
      if (from === undefined) return null;
      const plan = this.session.core.respond(pid(from), { function: 'ask', query: { predicate: 'troubled', args: { subject: id } }, speaker: pid(person) });
      hearResponse(this.session.core, pid(from), pid(person), plan);
    }
    const r = this.respond(person, { function: 'ask', query: { predicate: 'troubled', args: { subject: id }, polarity: true } });
    return r.heard.includes(id) ? r : null;
  }

  /** The guide sent this person over (true) or they gave up waiting (false). */
  beckon(person: number, on: boolean): void {
    if (on) this.beckoned.add(person); else this.beckoned.delete(person);
  }

  /** The topics the player can pick with this person now. */
  topics(person: number): Topic[] {
    const t = this.talk.topics;
    if (this.mannerOf(person)?.refuse) return [{ id: 'bye', label: t.bye }];
    const out: Topic[] = [{ id: 'self', label: t.self }, { id: 'news', label: t.news, ...(this.beckoned.has(person) ? { lead: true } : {}) }];
    // A place gone quiet: its household can be told.
    for (const id of this.quiet) {
      if (!this.reportTo(id).includes(person)) continue;
      const h = this.cellarHouse.get(id);
      const own = h && !h.site && this.byId.get(person)?.person.home === h.building;
      out.push({ id: `report:${id}`, label: cap(fill(this.talk.cleared.topic, { place: own ? this.talk.cleared.yours : this.cellarCalled(id) })), lead: true });
    }
    // A cellar moved into again: only its newest story is a topic; a quiet or kept one is none.
    this.leads.forEach((l, i) => {
      const place = (x: string) => this.cellarHouse.get(x)?.dungeon;
      if (this.quiet.has(l) || this.settled.has(l)) return;
      if (this.leads.slice(i + 1).some((m) => place(m) === place(l))) return;
      out.push({ id: `lead:${l}`, label: cap(this.cellarCalled(l)), lead: true });
    });
    if (this.session.core.context(pid(person)).pendingOffer) out.push({ id: 'more', label: t.more });
    if (this.told.has(person)) out.push({ id: 'source', label: t.source });
    for (const s of this.services(person)) out.push({ id: s.id, label: s.label });
    out.push({ id: 'bye', label: t.bye });
    return out;
  }

  /** Who knows the hero from before, and their greeting ({hero}: the hero's name); replaces any before. */
  acquaint(friends: readonly { readonly person: number; readonly line: string }[], hero: string): void {
    this.friends.clear();
    for (const f of friends) this.friends.set(f.person, fill(f.line, { hero, name: this.nameOf(f.person) }));
  }

  /** Open a conversation: the greeting (an old friend greets the hero by name). */
  greet(person: number): Reply {
    this.told.delete(person);
    const reply = this.respond(person, { function: 'greet' });
    const manner = this.mannerOf(person);
    // Hated: no word for the hero but to go away, old friend or not.
    if (manner?.refuse) return { ...reply, text: manner.greet ?? reply.text };
    const friend = this.friends.get(person);
    if (friend) return { ...reply, text: friend };
    // Come over to the hero: they open with why (one of the setting's hails, the same for a person each time).
    const hail = this.talk.beckon;
    if (this.beckoned.has(person) && hail.length) return { ...reply, text: hail[person % hail.length] };
    // As their people stand with the hero (plan 11.6).
    return manner?.greet ? { ...reply, text: manner.greet } : reply;
  }

  /** Pick a topic. */
  ask(person: number, topic: string): Reply {
    // Unwelcome: they keep what they know to themselves.
    const curt = this.mannerOf(person)?.curt;
    if (curt && (topic === 'news' || topic === 'more' || topic === 'source' || topic.startsWith('lead:'))) return { text: curt, heard: [], done: false };
    if (topic === 'self') return this.respond(person, { function: 'social', topic: 'identity' });
    if (topic === 'news') this.beckoned.delete(person);
    // Only trouble still open is news (a place made safe is not).
    if (topic === 'news') return this.respond(person, { function: 'ask', query: { predicate: 'troubled', polarity: true } });
    if (topic === 'more') return this.respond(person, { function: 'elaborate' });
    if (topic === 'source') {
      const a = this.told.get(person);
      return this.respond(person, { function: 'ask_evidence', ...(a ? { query: { predicate: a.predicate, args: a.args } } : {}) });
    }
    if (topic === 'bye') return { ...this.respond(person, { function: 'farewell' }), done: true };
    const service = this.services(person).find((s) => s.id === topic);
    if (service) return { text: service.line, heard: [], done: true, opens: service.id };
    if (topic.startsWith('report:')) throw new Error(`a report is told with toldSafe(), not asked: ${topic}`);
    if (topic.startsWith('lead:')) return this.respond(person, { function: 'ask', query: { args: { subject: topic.slice(5) } } });
    throw new Error(`unknown topic ${topic}`);
  }

  private respond(person: number, act: Act): Reply {
    const n = (this.turns.get(person) ?? 0) + 1;
    this.turns.set(person, n);
    const r = this.session.respondAct(pid(person), { ...act, speaker: 'player' });
    const factual = act.function === 'ask' || act.function === 'elaborate';
    const heard = factual ? cellarsIn(r.plan).filter((c) => this.cellarName.has(c)) : [];
    for (const c of heard) if (!this.leads.includes(c)) this.leads.push(c);
    if (factual) {
      const shown = r.plan.results[0]?.primary.atom;
      if (shown) this.told.set(person, shown); else this.told.delete(person);
    }
    // Knowing nothing reads as plain talk, not as the engine's "I don't know about that".
    const nothing = this.talk.nothing;
    const text = factual && !r.plan.results.length && act.function === 'ask' ? nothing[(person + n) % nothing.length] : this.ownWords(person, r.text);
    return { text, heard, done: false };
  }

  /** The household speaks of the cellar under their own house as theirs ("our cellar"), not by its house's name. */
  private ownWords(person: number, text: string): string {
    const home = this.byId.get(person)?.person.home;
    let out = text;
    for (const [id, h] of this.cellarHouse) {
      if (h.building !== home || h.site) continue;
      const name = this.cellarName.get(id)!;
      out = out.split(name).join(this.talk.ownCellar).split(cap(name)).join(cap(this.talk.ownCellar));
    }
    return out;
  }

  /** For the save (plan 17: the talk's evidence and the leads). */
  save(): TownTalkSave {
    return { session: this.session.snapshot(), leads: [...this.leads], quiet: [...this.quiet], settled: [...this.settled] };
  }
}

export interface TownTalkSave {
  readonly session: SettingSnapshot;
  readonly leads: readonly string[];
  /** Places gone quiet, not yet told (none in older saves). */
  readonly quiet?: readonly string[];
  /** Promises kept and told (none in older saves: the game settles what its log has kept). */
  readonly settled?: readonly string[];
}

/** The subjects a plan's answers are about. */
function cellarsIn(plan: Plan): string[] {
  const out = new Set<string>();
  for (const g of plan.results) {
    const s = g.primary.atom.args.subject;
    if (typeof s === 'string') out.add(s);
  }
  return [...out];
}

/** The talk of a town: its folk named, and the cellars promised under its houses told to them. */
export function townTalk(seed: number, setting: SettingModule, town: Town, people: readonly Person[], log: DecisionLog, saved?: TownTalkSave): { talk: TownTalk; folk: Folk[] } {
  const folk = nameFolk(people, town.plan, setting.names, setting.talk, seed);
  const cellars: TalkCellar[] = [];
  for (const d of log) {
    const c = talkCellar(d, setting, town, people, log);
    if (c) cellars.push(c);
  }
  return { talk: new TownTalk(folk, setting.talk, cellars, saved), folk };
}

/** A promise as the townsfolk know it (a cellar under one of this town's houses, or new dwellers in one); null for any other decision. */
export function talkCellar(d: Decision, setting: SettingModule, town: Town, people: readonly Person[], log: DecisionLog): TalkCellar | null {
  const dungeon = dungeonOf(log, d);
  if (!dungeon || dungeon.town !== town.decision.id) return null;
  const house = placeOf(dungeon, [town]);
  if (!house) return null;
  const sketch = sketchCellar(dungeon, house, loreOf(setting, dungeon.template), d.kind === 'move-in' ? d : undefined);
  return { sketch, hint: cellarHint(sketch, people, town.plan) };
}
