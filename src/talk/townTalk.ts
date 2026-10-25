/**
 * Talking with the townsfolk (plan 9.1, D36): topic-based dialogue through Arnd's Conversations package.
 * Every townsperson is a character with their own evidence; the VGM's hints (vgm/hints.ts) go in as what
 * the household has seen themselves and as hearsay passed on to the inn and the neighbours. The player
 * picks a topic, the person answers from what they know, and hearing of a promised cellar is the
 * commitment signal (plan 4.2) the journal and the map pick up. Pure: no DOM, no three.js.
 */
import { characterFromProfile, createSettingSession, hearResponse, type Act, type Atom, type Fact, type Plan, type Profile, type SettingSession, type SettingSnapshot } from 'solarpolis-dialogue';
import { createEnglishResources, englishModule, type EnglishResources } from 'solarpolis-dialogue/english';
import { hash2f } from '@futuremagic/core';
import type { SettingModule, TalkDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { cellarHint, type CellarHint } from '../vgm/hints';
import type { DecisionLog } from '../world/decisions';
import { sketchCellar, type CellarSketch } from '../world/dungeon/cellar';
import type { Town } from '../world/town';
import { fill, nameFolk, type Folk } from './folk';

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

export interface Reply {
  readonly text: string;
  /** Cellars (decision ids) this answer told the player about, and who told. */
  readonly heard: readonly string[];
  /** The conversation is over (farewell). */
  readonly done: boolean;
}

const TEMPERAMENTS = ['warm', 'reserved', 'curious', 'dry', 'lively'] as const;
const pid = (id: number) => `p${id}`;
/** Lines arrive as sentences; the realizer adds its own capital and full stop (and quotes them mid-sentence). */
const clause = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/[.!]\s*$/, '');
/** The first letter upper case. */
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export class TownTalk {
  private readonly session: SettingSession;
  private readonly byId = new Map<number, Folk>();
  /** Lead topics the player can ask about (cellar ids), in the order heard. */
  private readonly leads: string[] = [];
  private readonly cellarName = new Map<string, string>();
  private readonly cellarHouse = new Map<string, { building: number; name: string }>();
  /** Turns asked per person (to vary the "nothing" lines). */
  private readonly turns = new Map<number, number>();
  /** What each person last told (so "How do you know?" asks about that alone). */
  private readonly told = new Map<number, Atom>();
  /** People who know the hero from before (plan 11.4), and how they greet them. */
  private readonly friends = new Map<number, string>();

  constructor(folk: readonly Folk[], private readonly talk: TalkDef, cellars: readonly TalkCellar[], saved?: TownTalkSave) {
    for (const f of folk) this.byId.set(f.person.id, f);
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
      const name = fill(talk.cellar, { house });
      this.cellarName.set(id, name);
      this.cellarHouse.set(id, { building: hint.building, name: house });
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
    this.session = createSettingSession({
      contractVersion: 1,
      id: 'masterworld-town',
      domain: {
        version: 1,
        entities,
        predicates: {
          troubled: { roles: { subject: 'entity' }, keyRoles: ['subject'] },
          noticed: { roles: { subject: 'entity', sign: 'string' }, keyRoles: ['subject', 'sign'] },
          story: { roles: { subject: 'entity', line: 'string' }, keyRoles: ['subject', 'line'] },
        },
        characters,
        facts,
      },
      languages: { en: resources },
    }, { languageModule: englishModule, saved: saved?.session });
    if (saved) this.leads.push(...saved.leads.filter((l) => this.cellarName.has(l)));
    else {
      // The household has told some of it around: the inn and a neighbour or two heard that something is wrong.
      for (const { hint } of cellars) for (const t of hint.told) {
        const plan = this.session.core.respond(pid(t.from), { function: 'ask', query: { predicate: 'troubled', args: { subject: hint.cellar } }, speaker: pid(t.to) });
        hearResponse(this.session.core, pid(t.from), pid(t.to), plan);
      }
    }
  }

  /** The person's name. */
  nameOf(person: number): string { return this.byId.get(person)?.name ?? '?'; }

  /** What a cellar is called in talk ("the cellar under the cottage of the Hollin family"). */
  cellarCalled(id: string): string { return this.cellarName.get(id) ?? id; }

  /** The building a cellar lies under (index into the town plan), and what it is called. */
  houseOf(id: string): number { return this.cellarHouse.get(id)?.building ?? -1; }
  houseCalled(id: string): string { return this.cellarHouse.get(id)?.name ?? id; }

  /** The topics the player can pick with this person now. */
  topics(person: number): Topic[] {
    const t = this.talk.topics;
    const out: Topic[] = [{ id: 'self', label: t.self }, { id: 'news', label: t.news }];
    for (const l of this.leads) out.push({ id: `lead:${l}`, label: cap(this.cellarCalled(l)), lead: true });
    if (this.session.core.context(pid(person)).pendingOffer) out.push({ id: 'more', label: t.more });
    if (this.told.has(person)) out.push({ id: 'source', label: t.source });
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
    const friend = this.friends.get(person);
    return friend ? { ...reply, text: friend } : reply;
  }

  /** Pick a topic. */
  ask(person: number, topic: string): Reply {
    if (topic === 'self') return this.respond(person, { function: 'social', topic: 'identity' });
    if (topic === 'news') return this.respond(person, { function: 'ask', query: { predicate: 'troubled' } });
    if (topic === 'more') return this.respond(person, { function: 'elaborate' });
    if (topic === 'source') {
      const a = this.told.get(person);
      return this.respond(person, { function: 'ask_evidence', ...(a ? { query: { predicate: a.predicate, args: a.args } } : {}) });
    }
    if (topic === 'bye') return { ...this.respond(person, { function: 'farewell' }), done: true };
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
    const text = factual && !r.plan.results.length && act.function === 'ask' ? nothing[(person + n) % nothing.length] : r.text;
    return { text, heard, done: false };
  }

  /** For the save (plan 17: the talk's evidence and the leads). */
  save(): TownTalkSave {
    return { session: this.session.snapshot(), leads: [...this.leads] };
  }
}

export interface TownTalkSave {
  readonly session: SettingSnapshot;
  readonly leads: readonly string[];
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
    if (d.kind !== 'dungeon' || d.town !== town.decision.id) continue;
    const house = town.plan.buildings.find((b) => b.id === d.building);
    if (!house) continue;
    const sketch = sketchCellar(d, house, setting.dungeons.cellar);
    cellars.push({ sketch, hint: cellarHint(sketch, people, town.plan) });
  }
  return { talk: new TownTalk(folk, setting.talk, cellars, saved), folk };
}
