/**
 * Fixed camps (D69, Z2): a camp decision's posts as a den's bodies, each scaled to its post's level, and when each dead one comes back.
 * A camp never moves, empties or changes hands: who stands at a post is fixed by the decision, and only who is dead and since when is
 * kept (in seconds of play). A post comes back after its respawn time (open question 1: 6 real minutes out on the land, ±20 %, seeded per
 * post and per return); a leader's post may come back as its named one (open question 7), rarer and slower. How it comes back is shown
 * (rule 11): the dead rise out of the ground where they fell, the living walk in from the edge of the camp's ground out of the hero's
 * sight; never in the hero's face (`mayReturn`). Pure.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { CampDef, CampsDef, CreatureDef, GrowthDef } from '../setting/contract';
import { evenDanger, levelOfDanger } from '../game/growth';
import type { CampDecision } from '../world/decisions';

/**
 * A creature's kind at `level` (Z2: a camp's foes are scaled to its zone's band): its danger the even fight for that level, its health,
 * blows, aim, guard and armour grown or shrunk in step, as the setting's own kinds grow from one to the next (a goblin to a spider:
 * health and blows with the danger, aim about 1.8 and guard 0.6 a point of danger). The same kind at its own level is itself.
 */
export function levelled(def: CreatureDef, level: number, g: GrowthDef): CreatureDef {
  if (levelOfDanger(g, def.danger) === level) return def;
  const danger = evenDanger(g, level), k = danger / def.danger, d = danger - def.danger;
  return {
    ...def,
    danger,
    health: Math.max(4, Math.round(def.health * k)),
    armour: Math.max(0, Math.round((def.armour + d / 10) * 10) / 10),
    defence: Math.max(5, Math.round(def.defence + d * 0.6)),
    attacks: def.attacks.map((a) => ({ ...a, damage: [Math.max(1, Math.round(a.damage[0] * k ** 0.8)), Math.max(2, Math.round(a.damage[1] * k ** 0.8))] as const, prowess: Math.max(8, Math.round(a.prowess + d * 1.8)) })),
  };
}

/** A named one (Z2): its kind two levels above its post, under its own name and with its own loot. */
export function namedOne(def: CreatureDef, name: string, loot: string, level: number, g: GrowthDef): CreatureDef {
  return { ...levelled(def, level, g), name, plural: name, loot };
}

/** The named one a leader's post may hold in its camp (none: the camp has none). */
export function namedOf(camp: CampDecision, def: CampDef): { readonly creature: string; readonly name: string; readonly loot: string } | null {
  const n = def.named?.length ? def.named[Math.floor(hash2f(camp.seed, 7, 1) * def.named.length)] : null;
  if (!n) return null;
  return { creature: n.creature, name: n.names[Math.floor(hash2f(camp.seed, 7, 2) * n.names.length)], loot: n.loot };
}

/** Does the leader's post of `camp` hold its named one this time (`round`: how often it has come back; 0: as first placed)? */
export function holdsNamed(camp: CampDecision, def: CampDef, rules: CampsDef, post: number, round: number): boolean {
  return !!def.named?.length && !!camp.posts[post]?.leader && hash2f(deriveSeed(camp.seed, 'named'), post, round) < rules.namedChance;
}

/** What stands at a post this time: the usual kind at its level, or the named one two above it. */
export function postDef(camp: CampDecision, def: CampDef, rules: CampsDef, defs: readonly CreatureDef[], g: GrowthDef, post: number, round: number): CreatureDef {
  const p = camp.posts[post];
  const named = holdsNamed(camp, def, rules, post, round) ? namedOf(camp, def) : null;
  const base = defs.find((d) => d.id === (named?.creature ?? p.creature));
  if (!base) throw new Error(`no creature "${named?.creature ?? p.creature}"`);
  return named ? namedOne(base, named.name, named.loot, Math.min(levelCap(g), p.level + 2), g) : levelled(base, p.level, g);
}

/** The highest level a foe is scaled to (the setting's last level). */
const levelCap = (g: GrowthDef): number => g.xp.length;

/**
 * How long (s) post `post` of a camp stays empty after its `round`-th death: the setting's time out on the land (a named one's, if it
 * was the named one), spread by its share, seeded per post and round so the camp does not come back all at once.
 */
export function respawnAfter(camp: CampDecision, rules: CampsDef, post: number, round: number, named: boolean, below = false): number {
  const h = hash2f(deriveSeed(camp.seed, 'respawn'), post, round);
  if (named) return rules.respawn.named[0] + (rules.respawn.named[1] - rules.respawn.named[0]) * h;
  return (below ? rules.respawn.below : rules.respawn.out) * (1 + rules.respawn.spread * (h * 2 - 1));
}

/** What the save keeps of a camp (Z2): when each dead post died (seconds of play), and how often each has come back. */
export interface CampSave {
  readonly dead: Readonly<Record<number, number>>;
  readonly rounds: Readonly<Record<number, number>>;
}

/** The camps' state for the save: the play clock (s) and each camp's dead. */
export interface CampsSave {
  readonly clock: number;
  readonly camps: Readonly<Record<string, CampSave>>;
}

/** How near the hero (m) a return is played rather than left unseen (Z2 check: never within 20 m in sight without its arrival). */
export const RETURN_SEEN = 20;

/**
 * Who of a camp comes back now and how: the posts dead long enough. A `rise` camp's dead rise where they fell (played, so also in sight);
 * a `walk` camp's come back only while the hero neither stands near their body nor sees where they walk in (`seen`: does the hero see
 * this point within RETURN_SEEN?).
 */
export function returnsDue(camp: CampDecision, def: CampDef, rules: CampsDef, save: CampSave, clock: number, seen: (x: number, z: number) => boolean, body: (post: number) => { x: number; z: number } | null): { post: number; from: { x: number; z: number } }[] {
  const out: { post: number; from: { x: number; z: number } }[] = [];
  for (const [k, at] of Object.entries(save.dead)) {
    const post = Number(k), round = save.rounds[post] ?? 0;
    if (clock - at < respawnAfter(camp, rules, post, round, holdsNamed(camp, def, rules, post, round))) continue;
    const fell = body(post);
    if (def.arrive === 'rise') { out.push({ post, from: fell ?? camp.posts[post] }); continue; }
    if (fell && seen(fell.x, fell.z)) continue;
    const from = edgeOf(camp, post, seen);
    if (from) out.push({ post, from });
  }
  return out;
}

/** Where a living one walks in from (Z2: from the edge of their ground): a point past the camp's edge the hero does not see, or null. */
export function edgeOf(camp: CampDecision, post: number, seen: (x: number, z: number) => boolean): { x: number; z: number } | null {
  const p = camp.posts[post], a0 = Math.atan2(p.z - camp.z, p.x - camp.x);
  for (let k = 0; k < 8; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4), d = camp.r + 15;
    const x = camp.x + Math.cos(a) * d, z = camp.z + Math.sin(a) * d;
    if (!seen(x, z)) return { x, z };
  }
  return null;
}

/** A camp's state after `post` died at `clock`. */
export const died = (s: CampSave | undefined, post: number, clock: number): CampSave => ({ dead: { ...s?.dead, [post]: clock }, rounds: { ...s?.rounds } });

/** A camp's state after `post` came back (one more round). */
export function returned(s: CampSave, post: number): CampSave {
  const dead = { ...s.dead };
  delete dead[post];
  return { dead, rounds: { ...s.rounds, [post]: (s.rounds[post] ?? 0) + 1 } };
}
