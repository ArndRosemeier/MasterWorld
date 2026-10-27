/**
 * The variety check (plan 8.1, "checked, not hoped for"): many cellars, and what repeats too often or is
 * missing. `npm test` runs a small sample; `npm run variety` the full sweep.
 */
import { deriveSeed, hash2f } from '@futuremagic/core';
import type { TownBuilding } from '@futuremagic/settlement';
import type { CellarLore, DungeonForm } from '../../setting/contract';
import type { DungeonDecision, DungeonTemplate } from '../decisions';
import { outlineCellar, type Cellar, type DungeonPlace } from './cellar';
import { setPiecesFor } from './setPieces';

export interface VarietyReport {
  readonly count: number;
  /** Problems, one line each (empty: fine). */
  readonly problems: string[];
  /** Share of the most common value, per aspect. */
  readonly top: Record<string, { value: string; share: number }>;
  /** Distinct values per aspect. */
  readonly distinct: Record<string, number>;
}

/** A plain town house to put a test cellar under. */
export function testHouse(i: number): TownBuilding {
  const k = (['house', 'inn', 'bakery', 'workshop', 'cottage'] as const)[i % 5];
  const hu = 3 + Math.floor(hash2f(11, i, 1) * 3), hv = 3 + Math.floor(hash2f(11, i, 2) * 4);
  return {
    id: i, kind: k, trade: k === 'workshop' ? 'cooper' : '', cx: 0, cz: 0, hu, hv, angle: 0, vx: 0, vz: 1,
    poly: [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]], floors: 2, floorH: 2.8, wall: 'timber', roof: 'gable', ridgeAlongU: true,
    cover: 'thatch', pitch: 0.8, floorY: 0, groundY: 0, attached: false, door: [0, hv, 0], household: 4, seed: i,
  } as unknown as TownBuilding;
}

export function testDecision(i: number, base = 1, template: DungeonTemplate = 'cellar', also?: readonly string[]): DungeonDecision {
  const pieces = setPiecesFor(template, also);
  return { kind: 'dungeon', id: `${template}-${i}`, template, town: 'town-1', building: i, seed: deriveSeed(base, 'variety', template === 'cellar' ? i : `${template}-${i}`), setPiece: pieces[i % pieces.length].id };
}

/** A test place: a town house for a kind under houses, else a named place on the land. */
function testPlace(i: number, template: DungeonTemplate, form: DungeonForm): DungeonPlace {
  return form.stands === 'house' ? testHouse(i) : { kind: template, hu: 3, hv: 3, name: `the ${form.word} on the hill` };
}

/** Limits: the most common value of each aspect may make up at most this share. */
const LIMITS: Record<string, number> = { layout: 0.03, mainPattern: 0.2, story: 0.12, goalRoom: 0.45, dressing: 0.05, setPiece: 0.12 };

/**
 * Plan 8.1: a library of 15-20 cycle patterns and a growing one of set pieces. At least this many
 * different ones must turn up (fewer in a small sample: one per `per` cellars).
 */
const MIN_DISTINCT: Record<string, { readonly n: number; readonly per: number }> = { mainPattern: { n: 14, per: 6 }, pattern: { n: 16, per: 4 }, setPiece: { n: 10, per: 6 } };

export function checkVariety(lore: CellarLore, count: number, base = 1, template: DungeonTemplate = 'cellar'): VarietyReport {
  const problems: string[] = [];
  const aspects: Record<string, string[]> = { layout: [], mainPattern: [], pattern: [], story: [], goalRoom: [], dressing: [], setPiece: [] };
  for (let i = 0; i < count; i++) {
    let c: Cellar;
    try { c = outlineCellar(testDecision(i, base, template, lore.form.pieces), testPlace(i, template, lore.form), lore); } catch (e) { problems.push(`${template} ${i}: ${(e as Error).message}`); continue; }
    const where = `${template} ${i} (${c.signature.split('|')[0]})`;
    if (c.pace.safe < 0) problems.push(`${where}: no safe spot`);
    if (!c.pace.shortcut) problems.push(`${where}: no shortcut out`);
    if (c.pace.route.length < 3) problems.push(`${where}: the goal is too near the entrance`);
    if (!c.props.some((p) => p.trace)) problems.push(`${where}: no traces of its history`);
    if (!c.history.every((h) => c.rooms.some((r) => r.era === h.layer) || c.props.some((p) => p.trace === h.layer))) problems.push(`${where}: a history layer left nothing behind`);
    if (c.pieceLink < 0) problems.push(`${where}: no signature set piece`);
    if (!c.clues.length) problems.push(`${where}: nothing to read`);
    if (!c.spawns.length) problems.push(`${where}: nobody lives there`);
    if (!c.hatch || c.hatch.kind !== lore.form.space.way) problems.push(`${where}: no way back out`);
    aspects.layout.push(c.signature);
    aspects.mainPattern.push(c.graph.patterns[0]);
    aspects.pattern.push(...c.graph.patterns.filter((p) => p !== 'shortcut' && p !== 'refuge'));
    aspects.story.push(c.history.map((h) => h.def.id).join('/'));
    aspects.goalRoom.push(c.rooms[c.graph.goal].use.id);
    aspects.dressing.push(c.props.map((p) => p.kind).sort().join(','));
    aspects.setPiece.push(c.setPiece.id);
  }
  const top: VarietyReport['top'] = {}, distinct: VarietyReport['distinct'] = {};
  for (const [k, vals] of Object.entries(aspects)) {
    const counts = new Map<string, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    const [value, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    top[k] = { value, share: vals.length ? n / vals.length : 0 };
    distinct[k] = counts.size;
    // Small samples can't show small shares: allow two of a kind.
    if (LIMITS[k] !== undefined && n > Math.max(2, LIMITS[k] * vals.length)) problems.push(`${k} repeats: "${value.slice(0, 80)}" in ${n} of ${vals.length}`);
    const min = MIN_DISTINCT[k];
    // A kind with fewer set pieces of its own than the bar: all of them.
    const want = min && (k === 'setPiece' ? Math.min(min.n, setPiecesFor(template).length) : min.n);
    if (min && want && counts.size < Math.min(want, Math.floor(count / min.per))) problems.push(`${k}: only ${counts.size} different ones (at least ${want} wanted)`);
  }
  return { count, problems, top, distinct };
}
