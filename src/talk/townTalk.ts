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
import type { AskDef, SettingModule, TalkDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { loreOf, placeOf } from '../vgm/dungeons';
import { cellarHint, type CellarHint } from '../vgm/hints';
import { eventTold, fadedOf } from '../vgm/events';
import { festivityTold } from '../vgm/festivities';
import { dwellersOf, keptOf } from '../vgm/leads';
import { askWords, askedOne, twistOf } from '../vgm/asks';
import { dungeonOf, type Decision, type DecisionLog, type DungeonDecision, type FestivityDecision } from '../world/decisions';
import { sketchCellar, type CellarSketch } from '../world/dungeon/cellar';
import type { Town } from '../world/town';
import { cap, fill, nameFolk, type Folk } from './folk';

/** A promised cellar as the townsfolk know it. */
export interface TalkCellar {
  readonly sketch: CellarSketch;
  readonly hint: CellarHint;
  /** What the household asks (D62): its verb and words (`{family}` still to fill with their name). None: clear it, in the talk's own words. */
  readonly ask?: TalkAsk;
}

/** A household's ask in talk (D62): the line they say, and for any verb but clear the topic, the journal's note and their thanks. */
export interface TalkAsk {
  readonly verb: string;
  readonly told: string;
  readonly topic: string;
  readonly note: string;
  readonly thanks: string;
  readonly missing: string;
  /** What someone lost says when the hero finds them alive. */
  readonly found: string;
  /** Who of the town is lost (a person id). */
  readonly lost?: number;
  /** Who of the town is the thief (a person id), and the words when they are faced. */
  readonly thief?: number;
  /** A thief's words when the hero faces them: the topics to pick and what they answer. */
  readonly faced?: NonNullable<AskDef['thief']>;
  /** A lie (Q3): the house whose the thing really is, the hero's line giving it to them, and their thanks. */
  readonly rightful?: number;
  readonly give?: string;
  readonly owned?: string;
}

/**
 * A story event as the townsfolk know it (C11, plan 4.5: talk knows events): what it is called, how they tell
 * it while it goes on and once it is over, and who of them saw it (a raided farm's household: a survivor's
 * story); everyone else has it from the talk of the town.
 */
export interface TalkEvent {
  readonly id: string;
  readonly name: string;
  readonly told: string;
  readonly done: string;
  readonly over: boolean;
  readonly witnesses: readonly number[];
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
  /** A thief just named and dealt with (D62): their promise, and how it ended. */
  readonly named?: { readonly id: string; readonly ending: 'caught' | 'let-go' | 'given' };
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
  /** Does the hero hold the keepsake of promise `id` (D62: a thief's stash found; set by the game)? */
  holding: (id: string) => boolean = () => false;
  /** Thieves who owned up (promise ids), and how each ended (D62): caught, or let go. */
  private readonly confessed = new Set<string>();
  private readonly endings = new Map<string, 'caught' | 'let-go' | 'given'>();
  /** How each person's people stand with the hero (set by the game; none: as with any stranger). */
  manner: (person: Person) => Manner | null = () => null;
  /** The story events the town knows of (C11), oldest first; and those that ended while talked of. */
  private readonly events: TalkEvent[];
  private readonly ended = new Set<string>();
  /** The events the hero can ask about: the latest few. */
  private static readonly EVENT_TOPICS = 3;

  private mannerOf(person: number): Manner | null {
    const f = this.byId.get(person);
    return f ? this.manner(f.person) : null;
  }

  constructor(private readonly folk: readonly Folk[], private readonly talk: TalkDef, cellars: readonly TalkCellar[], saved?: TownTalkSave, events: readonly TalkEvent[] = []) {
    for (const f of folk) this.byId.set(f.person.id, f);
    this.cellars = [...cellars];
    this.events = [...events];
    this.open(saved?.session);
    if (saved) {
      this.leads.push(...saved.leads.filter((l) => this.cellarName.has(l)));
      for (const id of saved.settled ?? []) this.settled.add(id);
      for (const id of saved.quiet ?? []) if (!this.settled.has(id)) this.quiet.add(id);
      for (const id of saved.confessed ?? []) this.confessed.add(id);
      for (const [id, e] of Object.entries(saved.endings ?? {})) this.endings.set(id, e);
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

  /** A story event in this town while playing (C11): everyone here knows of it from now on. */
  addEvent(e: TalkEvent): void {
    if (this.events.some((x) => x.id === e.id)) return;
    this.events.push(e);
    this.open(this.session.snapshot());
  }

  /** A story event is over (its band beaten, or it ran its course: `done` says how): from now on they tell how it ended. */
  endEvent(id: string, done?: string): void {
    const e = this.events.find((x) => x.id === id);
    if (!e || e.over || this.ended.has(id)) return;
    this.ended.add(id);
    const line = (s: string) => ({ predicate: 'befell', args: { subject: id, line: clause(s) } });
    this.session.core.applyEvent({ id: `ended/${id}`, changes: [{ atom: { ...line(e.told), polarity: false } }, { atom: { ...line(done ?? e.done), polarity: true } }], observers: this.folk.map((f) => pid(f.person.id)), origin: { kind: 'vgm', promise: id } });
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
        identity: fill((p.bySea ? talk.identity['traveller:sea'] : undefined) ?? talk.identity[`${p.role}:${p.trade}`] ?? talk.identity[p.role] ?? talk.identity.homemaker, { name: f.name, trade: p.trade, house: f.house }),
        sourceReply: 'I know it from {source}: {claim}.',
      };
      // The household's own source reads as their own house.
      return { ...characterFromProfile(profile), voice: pid(p.id), personality: { detail: 1, testimony: 'provisional' as const, affiliation: 0.9 } };
    });
    const facts: Fact[] = [];
    for (const { sketch, hint, ask } of cellars) {
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
      // What they ask of whoever goes (D62), in their own words: the first thing they say more of.
      if (ask) facts.push(fact('asked', { predicate: 'noticed', args: { subject: id, sign: clause(fill(ask.told, this.namesFor(sketch.decision))) } }));
      sketch.hints.forEach((h, i) => facts.push(fact(`sign-${i}`, { predicate: 'noticed', args: { subject: id, sign: clause(h) } })));
      sketch.history.filter((h) => h.layer === 'built' || h.layer === 'older').forEach((h, i) => facts.push(fact(`story-${i}`, { predicate: 'story', args: { subject: id, line: clause(h.text) } })));
    }
    // Story events (C11): those who saw it know it themselves, everyone else from the talk of the town.
    for (const e of this.events) {
      entities[e.id] = { type: 'place' };
      names[e.id] = clause(e.name);
      const atom = { predicate: 'befell', args: { subject: e.id, line: clause(e.over ? e.done : e.told) } };
      const saw = new Set(e.witnesses.map(pid)), all = folk.map((f) => pid(f.person.id));
      const fact = (n: string, knownBy: string[], sourceKey: string): Fact => ({ id: `${e.id}/${n}`, atom, validFrom: 0, validTo: null, knownBy, sourceKey, origin: { kind: 'vgm', promise: e.id } });
      if (saw.size) facts.push(fact('saw', [...saw], 'source.saw'));
      facts.push(fact('heard', all.filter((x) => !saw.has(x)), 'source.word'));
    }
    const resources: EnglishResources = {
      ...createEnglishResources({
        entities: names,
        predicates: {
          troubled: { positive: talk.troubled, negative: `nothing is wrong in {subject}` },
          noticed: { positive: '{sign}' },
          story: { positive: '{line}' },
          befell: { positive: '{line}' },
        },
      }),
      voices,
      social,
      sources: { 'source.house': talk.ownHouse, 'source.saw': talk.happened?.saw ?? talk.ownHouse, 'source.word': talk.happened?.heard ?? talk.ownHouse },
    };
    // One version per cellar and story event known, counting from 1 with none (a town whose first cellar comes later, plan B3a).
    const version = cellars.length + this.events.length + 1;
    const domain: Domain = {
        version,
        migrateFrom: Array.from({ length: version - 1 }, (_, i) => i + 1),
        entities,
        predicates: {
          troubled: { roles: { subject: 'entity' }, keyRoles: ['subject'] },
          noticed: { roles: { subject: 'entity', sign: 'string' }, keyRoles: ['subject', 'sign'] },
          story: { roles: { subject: 'entity', line: 'string' }, keyRoles: ['subject', 'line'] },
          befell: { roles: { subject: 'entity', line: 'string' }, keyRoles: ['subject', 'line'] },
        },
        characters,
        facts,
      };
    // A state from before the latest cellars: its people take in the new facts (Conversations' own migration).
    const state = saved && saved.domainVersion !== version ? { ...saved, domainVersion: version, core: new AgentCore(domain, saved.core).snapshot() } : saved;
    this.session = createSettingSession({ contractVersion: 1, id: 'masterworld-town', domain, languages: { en: resources } }, { languageModule: englishModule, saved: state });
  }

  /** How a thief's promise ended (D62): caught or let go; null while not faced. */
  endingOf(id: string): 'caught' | 'let-go' | 'given' | null { return this.endings.get(id) ?? null; }

  /** The person's name. */
  nameOf(person: number): string { return this.byId.get(person)?.name ?? '?'; }

  /** What promise `id`'s household asks (D62), named for them; null: clear it, in the talk's own words. */
  askOf(id: string): TalkAsk | null {
    const c = this.cellars.find((x) => x.hint.cellar === id);
    if (!c?.ask || c.ask.verb === 'clear') return null;
    const names = this.namesFor(c.sketch.decision), named = (t: string) => fill(t, names);
    const f = c.ask.faced;
    return {
      ...c.ask, told: named(c.ask.told), topic: named(c.ask.topic), note: named(c.ask.note), thanks: named(c.ask.thanks), missing: named(c.ask.missing), found: named(c.ask.found),
      ...(c.ask.give ? { give: named(c.ask.give), owned: named(c.ask.owned ?? '') } : {}),
      ...(f ? { faced: { accuse: named(f.accuse), confess: named(f.confess), catch: named(f.catch), spare: named(f.spare), caught: named(f.caught), spared: named(f.spared) } } : {}),
    };
  }

  /** The names a promise's ask fills (D62): its household's family, and who is lost (or the thief), by the name the household uses. */
  namesFor(d: DungeonDecision): { family: string; who: string; other: string } {
    const a = this.cellars.find((c) => c.sketch.decision.id === d.id)?.ask, who = a?.lost ?? a?.thief, f = who === undefined ? undefined : this.byId.get(who);
    return { family: this.familyAt(d.building), who: !f ? '' : f.person.home === d.building ? f.given : f.name, other: a?.rightful === undefined ? '' : this.familyAt(a.rightful) };
  }

  /** The family a house is called after (its first named household's): who a keepsake belongs to (D62). */
  familyAt(building: number): string { return this.folk.find((f) => f.person.home === building)?.family ?? ''; }

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

  /** `person` of the household knows the place of promise `id` is safe again and has thanked the hero (they came to see): kept. */
  thanked(person: number, id: string): void {
    this.hush(id);
    this.beckoned.delete(person);
  }

  /**
   * The hero tells `person` the place of promise `id` is safe again: the promise is kept, and they say
   * `thanks` (the game pays). With a lead the hero has not heard of yet, they pass on its rumour (the
   * journal and the map take it up as any lead heard).
   */
  toldSafe(person: number, id: string, thanks: string): Reply {
    this.thanked(person, id);
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
      const asked = this.askOf(id);
      out.push({ id: `report:${id}`, label: cap(fill(asked?.topic ?? this.talk.cleared.topic, { place: own ? this.talk.cleared.yours : this.cellarCalled(id) })), lead: true });
    }
    // A cellar moved into again: only its newest story is a topic; a quiet or kept one is none.
    this.leads.forEach((l, i) => {
      const place = (x: string) => this.cellarHouse.get(x)?.dungeon;
      if (this.quiet.has(l) || this.settled.has(l)) return;
      if (this.leads.slice(i + 1).some((m) => place(m) === place(l))) return;
      out.push({ id: `lead:${l}`, label: cap(this.cellarCalled(l)), lead: true });
    });
    // A thief (D62): faced with what they stole, they own up; then the hero turns them in or lets them go.
    for (const c of this.cellars) {
      const id = c.hint.cellar, a = this.askOf(id)?.faced;
      if (c.ask?.thief !== person || !a || this.endings.has(id) || this.settled.has(id)) continue;
      if (!this.confessed.has(id)) { if (this.holding(id)) out.push({ id: `accuse:${id}`, label: a.accuse, lead: true }); }
      else out.push({ id: `catch:${id}`, label: a.catch, lead: true }, { id: `spare:${id}`, label: a.spare, lead: true });
    }
    // A lie (Q3): the thing's rightful household can be given it, by the hero who holds it.
    const home = this.byId.get(person)?.person;
    for (const c of this.cellars) {
      const id = c.hint.cellar, a = this.askOf(id);
      if (!a?.give || c.ask?.rightful !== home?.home || home?.role === 'child' || this.endings.has(id) || this.settled.has(id) || !this.holding(id)) continue;
      out.push({ id: `give:${id}`, label: a.give, lead: true });
    }
    // What has happened here lately (C11): the latest few story events, each a topic.
    for (const e of this.events.slice(-TownTalk.EVENT_TOPICS).reverse()) out.push({ id: `event:${e.id}`, label: cap(e.name) });
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
    if (curt && (topic === 'news' || topic === 'more' || topic === 'source' || topic.startsWith('lead:') || topic.startsWith('event:'))) return { text: curt, heard: [], done: false };
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
    // A thief faced (D62): only the one who did it is offered these (`topics`).
    if (topic.startsWith('give:')) {
      const id = topic.slice(5);
      this.endings.set(id, 'given');
      return { text: this.askOf(id)?.owned ?? '', heard: [], done: false, named: { id, ending: 'given' } };
    }
    const thief = /^(accuse|catch|spare):(.+)$/.exec(topic);
    if (thief) {
      const [, act, id] = thief, a = this.askOf(id!)?.faced;
      if (!a) throw new Error(`no thief for ${id}`);
      if (act === 'accuse') { this.confessed.add(id!); return { text: a.confess, heard: [], done: false }; }
      const ending = act === 'catch' ? 'caught' : 'let-go';
      this.endings.set(id!, ending);
      return { text: act === 'catch' ? a.caught : a.spared, heard: [], done: false, named: { id: id!, ending } };
    }
    if (topic.startsWith('report:')) throw new Error(`a report is told with toldSafe(), not asked: ${topic}`);
    if (topic.startsWith('lead:')) return this.respond(person, { function: 'ask', query: { args: { subject: topic.slice(5) } } });
    if (topic.startsWith('event:')) return this.respond(person, { function: 'ask', query: { args: { subject: topic.slice(6) }, polarity: true } });
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
    return { session: this.session.snapshot(), leads: [...this.leads], quiet: [...this.quiet], settled: [...this.settled], confessed: [...this.confessed], endings: Object.fromEntries(this.endings) };
  }
}

export interface TownTalkSave {
  readonly session: SettingSnapshot;
  readonly leads: readonly string[];
  /** Places gone quiet, not yet told (none in older saves). */
  readonly quiet?: readonly string[];
  /** Promises kept and told (none in older saves: the game settles what its log has kept). */
  readonly settled?: readonly string[];
  /** Thieves who owned up, and how each ended (D62; none in older saves). */
  readonly confessed?: readonly string[];
  readonly endings?: Readonly<Record<string, 'caught' | 'let-go' | 'given'>>;
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
export function townTalk(seed: number, setting: SettingModule, town: Town, people: readonly Person[], log: DecisionLog, saved?: TownTalkSave, towns: readonly Town[] = [town], hours = Infinity): { talk: TownTalk; folk: Folk[] } {
  const folk = nameFolk(people, town.plan, setting.names, setting.talk, seed);
  const cellars: TalkCellar[] = [], events: TalkEvent[] = [];
  for (const d of log) {
    const c = talkCellar(d, setting, town, people, log);
    if (c) cellars.push(c);
    const e = talkEvent(d, setting, town, people, log, towns, hours);
    if (e) events.push(e);
  }
  return { talk: new TownTalk(folk, setting.talk, cellars, saved, events), folk };
}

/**
 * A story event as this town's folk know it (C11): one of theirs (an event of this town), named and told as
 * the setting's words have it; a raid's farm household saw it, and a taken place's folk (they fled it). Over,
 * they tell how it ended: beaten, or run its course (faded). Null for any other decision.
 */
export function talkEvent(d: Decision, setting: SettingModule, town: Town, people: readonly Person[], log: DecisionLog, towns: readonly Town[], hours = Infinity): TalkEvent | null {
  if (d.kind === 'festivity') return talkFeast(d, setting, town, log, towns, hours);
  const id = town.decision.id, fled = d.kind === 'event' && d.held === id;
  if (d.kind !== 'event' || (d.town !== id && !fled)) return null;
  const told = eventTold(setting, log, towns, d);
  if (!told) return null;
  const pd = d.paddock === undefined ? undefined : town.plan.paddocks[d.paddock], farm = pd && pd.farm >= 0 ? town.plan.farms[pd.farm] : undefined;
  const witnesses = people.filter((p) => p.role !== 'child' && (fled || (farm && p.home === farm.house))).map((p) => p.id);
  return { id: d.id, name: told.title, told: told.told, done: fadedOf(log, d.id) ? told.faded : told.done, over: keptOf(log).has(d.id), witnesses };
}

/** A feast as its town knows it (C11: a good day for a deed of the hero's): to come, or over once its hours are past. Market days are not talked of. */
function talkFeast(d: FestivityDecision, setting: SettingModule, town: Town, log: DecisionLog, towns: readonly Town[], hours: number): TalkEvent | null {
  if (d.town !== town.decision.id || !d.for) return null;
  const told = festivityTold(setting, log, towns, d);
  return told && { id: d.id, name: told.title, told: told.told, done: told.done, over: hours >= d.to, witnesses: [] };
}

/** A promise as the townsfolk know it (a cellar under one of this town's houses, or new dwellers in one); null for any other decision. */
export function talkCellar(d: Decision, setting: SettingModule, town: Town, people: readonly Person[], log: DecisionLog): TalkCellar | null {
  const dungeon = dungeonOf(log, d);
  if (!dungeon || dungeon.town !== town.decision.id) return null;
  const house = placeOf(dungeon, [town], setting.dungeons);
  if (!house) return null;
  // As the town tells it (a place changed since, Q3, is told as it was).
  const sketch = sketchCellar(dungeon, house, loreOf(setting, dungeon.template), dwellersOf(log, d), true);
  // The place's own promise carries its household's ask (D62); new dwellers in it are only to be cleared.
  const words = d.kind === 'dungeon' ? askWords(setting, d.ask, { family: '{family}', who: '{who}' }) : null;
  const one = d.kind === 'dungeon' ? askedOne(people, log, d) : null, lost = d.kind === 'dungeon' && d.ask?.verb === 'lost' ? one : null, thief = d.kind === 'dungeon' && d.ask?.verb === 'thief' ? one : null;
  const { thief: faced, ...said } = words ?? { thief: undefined };
  // A twist (Q3): what the household adds of it, their thanks owning to it, and whose a lied-about thing really is.
  const twist = d.kind === 'dungeon' ? twistOf(setting, d.ask) : null;
  const homes = [...new Set(people.map((p) => p.home))].filter((h) => h !== dungeon.building && h >= 0);
  const rightful = twist?.kind === 'lied' && homes.length ? homes[dungeon.seed % homes.length] : undefined;
  const twisted = twist ? { ...(twist.words.told ? { told: `${words?.told ?? ""} ${cap(twist.words.told)}` } : {}), ...(twist.words.thanks ? { thanks: cap(twist.words.thanks) } : {}) } : {};
  const gives = rightful !== undefined && twist?.words.give && twist.words.rightful ? { rightful, give: cap(twist.words.give), owned: cap(twist.words.rightful) } : {};
  const ask = words && d.kind === 'dungeon' && d.ask ? { verb: d.ask.verb, ...(said as Omit<typeof words, 'thief'>), ...twisted, ...gives, ...(lost ? { lost: lost.id } : {}), ...(thief ? { thief: thief.id } : {}), ...(faced ? { faced } : {}) } : null;
  return { sketch, hint: cellarHint(sketch, people, town.plan), ...(ask ? { ask } : {}) };
}
