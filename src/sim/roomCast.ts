/**
 * Who is where in a room (D38): the people the simulation has indoors in a building, each given one of
 * the room's spots (@futuremagic/settlement planInterior) by what they are there for. Those working
 * there take the work spots (the innkeeper the counter, the smith the anvil, the keeper the basin); the
 * rest sit, drink, pray or warm themselves. Those drinking at the inn's tables or praying at the temple's
 * offering are drawn inside while the player is (the room is where one would look for them). Those asleep at home
 * lie in its beds (the master of the house first; more sleepers than beds: the rest are not drawn). Pure.
 */
import type { InteriorFixture, InteriorPlan, InteriorSpot, InteriorSpotKind } from '@futuremagic/settlement';
import type { ActivityKind } from './spots';
import type { Agent } from './townLife';

export interface Cast {
  agent: Agent;
  /** Index into the plan's spots. */
  spot: number;
  act: ActivityKind;
}

/** What a spot is used for, as the townsfolk's activity (the renderer's clip). */
const ACT: Record<InteriorSpotKind, ActivityKind> = {
  sit: 'sit', drink: 'drink', serve: 'serve', smith: 'smith', stoke: 'stoke', quench: 'quench', craft: 'craft',
  bake: 'bake', sleep: 'sleep', pray: 'pray', tend: 'tend', warm: 'browse',
  // A hall's master by the practice post, arms folded, watching who comes in.
  drill: 'browse',
};
const WORK: ReadonlySet<InteriorSpotKind> = new Set(['serve', 'smith', 'stoke', 'quench', 'craft', 'bake', 'tend', 'drill']);
/** Where a visitor or a member of the household goes, likeliest first. */
const REST: readonly InteriorSpotKind[] = ['drink', 'sit', 'pray', 'warm'];

/** Is `a`, at spot `s`, in that spot's building's room (indoors there, or drinking or praying at its tables)? */
export function inRoom(a: Agent, s: { building: number; door?: boolean }): boolean {
  if (s.building < 0) return false;
  return s.door ? a.hidden && a.act !== 'sleep' : a.act === 'drink' || a.act === 'pray';
}

/** The bench a spot is on (people sit there, on its top), or with `kind` 'bed' the bed (they lie on it), if any. */
export function benchUnder(plan: InteriorPlan, s: InteriorSpot, kind: 'bench' | 'bed' = 'bench'): InteriorFixture | undefined {
  return plan.fixtures.find((f) => f.kind === kind && f.storey === s.storey && Math.abs(s.a - f.a) <= f.w / 2 && Math.abs(s.b - f.b) <= f.d / 2);
}

/**
 * The cast of `building`'s room, in a stable order (by person). `kept`: the spot each had before (while the room is
 * drawn): they keep it while it is theirs to keep, so one coming in or going does not send the rest to other seats.
 */
export function roomCast(agents: readonly Agent[], spots: readonly { building: number; door?: boolean }[], building: number, plan: InteriorPlan, kept?: ReadonlyMap<Agent, number>): Cast[] {
  const at = (a: Agent) => (a.spot >= 0 ? spots[a.spot] : null);
  const inside = agents.filter((a) => {
    const s = at(a);
    // Someone held for a talk in the room stays in it (holding shows them, as out of doors); someone stopped
    // out of doors on the way in stays out there with the hero.
    return !!s && s.building === building && !a.woke && (a.held ? !!a.heldIn : inRoom(a, s));
  });
  const free = plan.spots.map((s, i) => ({ kind: s.kind, i })).filter((s) => s.kind !== 'sleep');
  const beds = plan.spots.map((s, i) => ({ kind: s.kind, i })).filter((s) => s.kind === 'sleep');
  const held = new Map<number, Agent>();
  for (const a of inside) { const i = kept?.get(a); if (i !== undefined) held.set(i, a); }
  const take = (ok: (k: InteriorSpotKind) => boolean, a: Agent): number => {
    const left = free.filter((s) => ok(s.kind));
    if (!left.length) return -1;
    // Spread people over the room's spots by who they are, not first come first served.
    const mine = left.find((x) => x.i === kept?.get(a));
    // Not a place someone else in the room had (they keep it), while there are others.
    const open = left.filter((x) => (held.get(x.i) ?? a) === a);
    const s = mine ?? (open.length ? open : left)[a.person.id % (open.length || left.length)];
    free.splice(free.indexOf(s), 1);
    return s.i;
  };
  const out: Cast[] = [];
  // Drinking at a table is drinking seated on its bench (standing on the bench showed their legs under it).
  const actAt = (i: number): ActivityKind => {
    const s = plan.spots[i], act = ACT[s.kind];
    return act === 'drink' && benchUnder(plan, s) ? 'sit' : act;
  };
  // Workers first, so the counter is never taken by a guest.
  const workers = inside.filter((a) => a.person.work === building), rest = inside.filter((a) => a.person.work !== building);
  for (const a of workers) {
    const ok = (k: InteriorSpotKind) => WORK.has(k) || (a.person.role === 'keeper' && k === 'pray');
    const i = take(ok, a);
    if (i >= 0) out.push({ agent: a, spot: i, act: actAt(i) });
    // No work spot here (the hedge witch's cottage): the first of the seats, before the household takes them all.
    else rest.unshift(a);
  }
  for (const a of rest) {
    // The place they had, whatever kind of rest it is; else the likeliest free one.
    let i = kept?.has(a) && free.some((s) => s.i === kept.get(a) && REST.includes(s.kind)) ? take((x) => REST.includes(x), a) : -1;
    if (i < 0) for (const k of REST) if ((i = take((x) => x === k, a)) >= 0) break;
    if (i >= 0) out.push({ agent: a, spot: i, act: actAt(i) });
  }
  // Asleep at home: in bed, the one working there first (the hedge witch in her own bed), each in the bed they had.
  // One woken for a talk stands by the bed (act 'chat' on its spot: roomFlow puts them beside it), and it stays theirs.
  const sleepers = agents.filter((a) => (a.held ? !!a.woke : a.act === 'sleep') && !!at(a)?.door && at(a)!.building === building)
    .sort((x, y) => Number(!!y.woke) - Number(!!x.woke) || Number(y.person.work === building) - Number(x.person.work === building) || x.person.id - y.person.id);
  const abed = (a: Agent, k: number) => { out.push({ agent: a, spot: beds[k].i, act: a.woke ? 'chat' : 'sleep' }); beds.splice(k, 1); };
  // The worker of the house first to the bed they had, then the rest to theirs, then any left.
  const mine = (a: Agent) => beds.findIndex((s) => s.i === kept?.get(a));
  const first = sleepers.filter((a) => a.woke || a.person.work === building), others = sleepers.filter((a) => !first.includes(a));
  for (const a of first) if (beds.length) abed(a, Math.max(0, mine(a)));
  const newcomers = others.filter((a) => { const k = mine(a); if (k >= 0) abed(a, k); return k < 0; });
  for (const a of newcomers) if (beds.length) abed(a, 0);
  return out.sort((x, y) => x.agent.person.id - y.agent.person.id);
}
