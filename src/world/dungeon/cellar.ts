/**
 * A cellar dungeon (plan 8, milestone 3), or another kind built the same way (a barrow out on the land),
 * from its decision, in the promise's stages (plan 4.2):
 *
 * - **Sketch**: the place's history in layers (who dug it, what lay there before, what went wrong, who
 *   lives there now), the hints the household can give and the facts they plant. Cheap.
 * - **Outline**: the graph of rooms from cycles (@futuremagic/dungeon) chosen to fit the history and the
 *   set piece, the tension curve, the layout in 3D, each room's use, the dressing (props and the traces
 *   history left), the clues and who lives where.
 *
 * The cellar is its own space (plan 8: entered through the hatch): metres in its own frame, the house's
 * cellar room at the origin, storey 0 the house's cellar, storey −1 what lay there before.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { cyclicGraph, layoutDungeon, pace, PATTERNS, DIRS, LayoutGrid, type DungeonGraph, type DungeonLayout, type Pace, type Room } from '@futuremagic/dungeon';
import type { CellarLore, DungeonForm, DungeonProp, DungeonScale, DungeonSpace as SpaceDef, DwellerDef, HistoryDef, RoomUseDef } from '../../setting/contract';
import type { DungeonDecision, MoveInDecision, RetakeDecision } from '../decisions';
import { depthOf, entranceOf } from './kinds';
import { setPieceById, type SetPieceDef } from './setPieces';
import { wayOutFree } from './caveThroat';

/** Metres per layout cell, per storey, and stairs per storey (cells): a built cellar's. */
export const CELL = 2;
export const STOREY = 2.8;
export const STAIR_RUN = 2;
/** Width of a door's opening, metres. */
export const DOOR_W = 1.3;

/** A built dungeon's grid in metres (a cellar, a barrow, a tower). */
export const BUILT: DungeonScale = { cell: CELL, storey: STOREY, stairRun: STAIR_RUN, passage: 2.5 };

/** A kind's grid in metres. */
export const scaleOf = (s: SpaceDef): DungeonScale => s.scale ?? BUILT;

/** A layout with its grid in metres: everything that turns its cells into the world reads it from here. */
export interface ScaledLayout extends DungeonLayout {
  readonly scale: DungeonScale;
  /** The water's surface (m, its frame) when its lowest storey is drowned (`SpaceDef.flood`, a sea cave). */
  readonly flood?: number;
}

/** The rooms a drowned storey holds: their floors under the water. */
export const drownedRooms = (l: ScaledLayout): Set<number> =>
  new Set(l.flood === undefined ? [] : l.rooms.filter((r) => r.level * l.scale.storey < l.flood!).map((r) => r.id));

/**
 * What stands at a wall takes up, as half its size along the wall and out from it (m), with room for the
 * small turn each piece is given. Things lying loose (bones, straw, rubble) may lie among each other; a
 * puddle under anything. Nothing stands in front of a door.
 */
const FOOT: Readonly<Record<DungeonProp, readonly [number, number]>> = {
  barrel: [0.34, 0.34], cask: [0.8, 0.42], rack: [0.82, 0.25], crate: [0.42, 0.4], sack: [0.3, 0.3], shelf: [0.75, 0.24],
  table: [0.58, 0.45], stool: [0.26, 0.26], cot: [0.96, 0.5], straw: [0.62, 0.5], rubble: [0.75, 0.75], bones: [0.35, 0.35],
  candle: [0.12, 0.12], lantern: [0.13, 0.13], ledger: [0.27, 0.22], chest: [0.47, 0.28], web: [0.85, 0.3], nest: [0.75, 0.75],
  vat: [0.7, 0.7], bricks: [0.42, 0.32], beam: [1.25, 0.5], puddle: [0.7, 0.5], bin: [0.55, 0.35], jar: [0.2, 0.2],
  ladder: [0.35, 0.3], door: [0.7, 0.3],
};
const LOOSE: ReadonlySet<DungeonProp> = new Set(['bones', 'straw', 'rubble', 'nest']);
/** The floor kept clear before a doorway: half its width, and how far into the room (m). */
const DOOR_CLEAR: readonly [number, number] = [DOOR_W / 2 + 0.2, 1.4];

/** A rectangle on the floor: centre, its first axis (unit), half sizes along that axis and across it. */
interface Rect { readonly x: number; readonly z: number; readonly ux: number; readonly uz: number; readonly a: number; readonly b: number }

/** Two rectangles on the floor overlap (by more than `slack` m). */
function rectsMeet(p: Rect, q: Rect, slack = 0.02): boolean {
  for (const [ax, az] of [[p.ux, p.uz], [-p.uz, p.ux], [q.ux, q.uz], [-q.uz, q.ux]]) {
    const reach = (r: Rect) => r.a * Math.abs(ax * r.ux + az * r.uz) + r.b * Math.abs(-ax * r.uz + az * r.ux);
    if (Math.abs((q.x - p.x) * ax + (q.z - p.z) * az) >= reach(p) + reach(q) - slack) return false;
  }
  return true;
}

/** The floor a prop takes up (its along-wall axis is (cos yaw, −sin yaw), as the props are drawn). */
export const propRect = (p: { kind: DungeonProp; x: number; z: number; yaw: number }): Rect =>
  ({ x: p.x, z: p.z, ux: Math.cos(p.yaw), uz: -Math.sin(p.yaw), a: FOOT[p.kind][0], b: FOOT[p.kind][1] });

/** The floor kept clear before a door, on the side of its room (a carved way opens the whole side of its cell). */
export const doorRect = (d: { x: number; z: number; dir: number }, s: DungeonScale = BUILT, carved = false): Rect => {
  const [dx, dz] = DIRS[d.dir], c = s.cell;
  return { x: (d.x + 0.5 + dx * 0.5) * c - dx * DOOR_CLEAR[1] / 2, z: (d.z + 0.5 + dz * 0.5) * c - dz * DOOR_CLEAR[1] / 2, ux: -dz, uz: dx, a: carved ? c / 2 : DOOR_CLEAR[0], b: DOOR_CLEAR[1] / 2 };
};

/** Prop `p` may stand beside `q` (loose things lie among each other; a puddle under anything). */
export const propsClash = (p: { kind: DungeonProp; x: number; z: number; yaw: number }, q: { kind: DungeonProp; x: number; z: number; yaw: number }): boolean =>
  p.kind !== 'puddle' && q.kind !== 'puddle' && !(LOOSE.has(p.kind) && LOOSE.has(q.kind)) && rectsMeet(propRect(p), propRect(q));

/** Prop `p` stands in the way of door `d` (a puddle may lie there). */
export const blocksDoor = (p: { kind: DungeonProp; x: number; z: number; yaw: number }, d: { x: number; z: number; dir: number }, s: DungeonScale = BUILT, carved = false): boolean =>
  p.kind !== 'puddle' && rectsMeet(propRect(p), doorRect(d, s, carved));

/** Cell (i, j) lies in the room's footprint. */
export const cellIn = (r: { x: number; z: number; w: number; d: number }, i: number, j: number): boolean => i >= r.x && i < r.x + r.w && j >= r.z && j < r.z + r.d;

export type HistoryLayer = 'built' | 'older' | 'trouble' | 'now';

export interface HistoryEntry {
  readonly layer: HistoryLayer;
  readonly def: HistoryDef;
  /** The line, with the house named. */
  readonly text: string;
}

/** A fact as a triple (plan 4.2: the same shape as Conversations' predicates). */
export type Fact = readonly [subject: string, predicate: string, object: string];

export interface CellarSketch {
  readonly decision: DungeonDecision;
  /** How its kind takes shape and stands (the lore's). */
  readonly form: DungeonForm;
  /** Oldest first: what lay there before, who built the cellar, what went wrong, who is there now. */
  readonly history: HistoryEntry[];
  readonly dweller: DwellerDef;
  readonly setPiece: SetPieceDef;
  /** What the household above can tell (plan 9: the hint), in their words. */
  readonly hints: string[];
  readonly facts: Fact[];
  /** Who in town would know: the household of this building of this town. */
  readonly knownBy: { readonly town: string; readonly building: number };
  /** The house above, as people call it ("the inn"); a barrow's own name ("the barrow north of town"). */
  readonly house: string;
  /** What talk calls the place, when it is not "the cellar under {house}" (a barrow). */
  readonly called?: string;
  /** Where its doorway is on the land, for a dungeon that is not under a house (world metres, yaw). */
  readonly site?: { readonly x: number; readonly z: number; readonly yaw: number };
  /** Who lives there now, if they moved in after it was cleared (plan 8.1: repopulation): the move-in's id and seed. */
  readonly occupation?: { readonly id: string; readonly seed: number };
  /** The move-in or retake whose dwellers live there now (none: the first ones). */
  readonly taken?: string;
}

export interface CellarRoom {
  readonly id: number;
  readonly use: RoomUseDef;
  /** Which history layer it belongs to. */
  readonly era: HistoryLayer;
  readonly tension: number;
  readonly beat: Pace['beat'][number];
}

export interface Prop {
  readonly kind: DungeonProp;
  readonly x: number;
  readonly z: number;
  /** Floor height. */
  readonly y: number;
  readonly yaw: number;
  readonly room: number;
  /** Left by this history layer (a trace) rather than the room's use. */
  readonly trace?: HistoryLayer;
  /** Index into `clues`, if reading it tells something. */
  readonly clue?: number;
}

/** Something the player can read or notice, and what it tells (a detective puzzle's pieces). */
export interface Clue {
  readonly text: string;
  readonly room: number;
  /** The link it points at (e.g. the secret door it gives away). */
  readonly link?: number;
}

/** Who lives where: a creature (id in the setting) in a home of its den (a room here; a territory out on the land, sim/wild.ts). */
export interface Spawn {
  readonly creature: string;
  readonly room: number;
  /** The one who breaks expectations (plan 8.1), if any. */
  readonly surprise?: string;
}

export interface Cellar extends CellarSketch {
  readonly graph: DungeonGraph;
  readonly pace: Pace;
  readonly layout: ScaledLayout;
  readonly rooms: CellarRoom[];
  readonly props: Prop[];
  readonly clues: Clue[];
  readonly spawns: Spawn[];
  /** The link the set piece hangs on. */
  readonly pieceLink: number;
  /** The way back out: the ladder under the hatch (a tower's door; a prop in the entrance room). */
  readonly hatch: Prop;
  /** For variety checks: what makes this cellar's shape. */
  readonly signature: string;
}

/**
 * Where a dungeon lies, as far as its making needs: the house above a cellar (its kind, trade and size),
 * or a barrow (`name`: what it is called; its size: the doorway's chamber).
 */
export interface DungeonPlace { readonly kind: string; readonly hu: number; readonly hv: number; readonly trade?: string; readonly name?: string }

/** How people call a building ("the cottage", "the cooper's workshop"), or the place's own name. */
export const houseName = (b: DungeonPlace): string =>
  b.name ?? (b.kind === 'house' || b.kind === 'cottage' ? `the ${b.kind}` : b.kind === 'workshop' && b.trade ? `the ${b.trade}'s workshop` : `the ${b.kind}`);

const pickDef = <T extends HistoryDef>(rng: Rng, list: readonly T[], ok: (d: T) => boolean = () => true): T => {
  const c = list.filter(ok);
  return rng.weighted(c.length ? c : list, (d) => d.weight ?? 1);
};

/**
 * The sketch: history, hints and facts (no layout). With `moved`, the dwellers who moved in after it was
 * cleared (plan 8.1); its history and hints are theirs, its id the move-in's.
 */
export function sketchCellar(d: DungeonDecision, house: DungeonPlace, lore: CellarLore, moved?: MoveInDecision | RetakeDecision): CellarSketch {
  const rng = new Rng(deriveSeed(d.seed, 'cellar', 'history'));
  const piece = setPieceById(d.setPiece);
  const name = houseName(house);
  const fits = (b: HistoryDef) => (house.kind === 'inn' ? ['wine-merchant', 'brewer'].includes(b.id) : house.kind === 'bakery' ? b.id === 'chandler' : true);
  const builder = pickDef(rng, lore.builders, fits);
  const older = piece.older || rng.chance(0.65) ? pickDef(rng, lore.older) : null;
  const trouble = pickDef(rng, lore.troubles, (t) => !piece.troubles || piece.troubles.includes(t.id));
  const ids = [builder.id, older?.id, trouble.id].filter(Boolean) as string[];
  // Who moves in fits the history and the place's danger (D29: fixed by where it lies, not by the hero).
  // Who was asked for (`dungeonFor`'s dwellers), if the lore has them here.
  const asked = d.dwellers ? lore.dwellers.filter((w) => w.encounter === d.dwellers) : [];
  const first = asked.length ? pickDef(rng, asked) : pickDef(rng, lore.dwellers, (w) => (!w.with || w.with.some((x) => ids.includes(x))) && w.danger <= (d.danger ?? Infinity));
  // Not every one is lived in (D57): an empty one is a sight, unless dwellers were asked for (its own stream: the rest stays).
  const empty = lore.empty && !asked.length && !moved && new Rng(deriveSeed(d.seed, 'cellar', 'empty')).chance(lore.empty.share) ? emptyDweller(lore.empty.def) : null;
  const dweller = (moved && lore.dwellers.find((w) => w.id === moved.dweller)) || empty || first;
  const line = (def: HistoryDef) => def.text.replaceAll('{house}', name).replaceAll('{place}', name);
  const history: HistoryEntry[] = [];
  if (older) history.push({ layer: 'older', def: older, text: line(older) });
  history.push({ layer: 'built', def: builder, text: line(builder) }, { layer: 'trouble', def: trouble, text: line(trouble) }, { layer: 'now', def: dweller, text: line(dweller) });
  const hints = moved?.kind === 'retake'
    ? [...dweller.signs, `Others have taken it lately: whoever was down there before has gone.`]
    : moved
    ? [...dweller.signs, `It was cleared, and for a while it was quiet down there. Now something else has moved in.`]
    : [...dweller.signs, `They say ${line(trouble).charAt(0).toLowerCase()}${line(trouble).slice(1)}`];
  const facts: Fact[] = [
    d.site ? [d.id, 'lies near', d.town] : [d.id, 'is under', `${d.town}/building/${d.building}`],
    [d.id, 'was dug by', builder.id],
    [d.id, 'suffered', trouble.id],
    [d.id, 'is home to', dweller.id],
  ];
  if (older) facts.push([d.id, 'lies over', older.id]);
  if (moved) facts.push([moved.id, moved.kind === 'retake' ? 'took' : 'moved into', d.id], [moved.id, 'is', dweller.id]);
  return { decision: d, form: lore.form, history, dweller, setPiece: piece, hints, facts, knownBy: { town: d.town, building: d.building }, house: name, ...(house.name ? { called: name } : {}), ...(d.site ? { site: d.site } : {}), ...(moved?.kind === 'move-in' ? { occupation: { id: moved.id, seed: moved.seed } } : {}), ...(moved ? { taken: moved.id } : {}) };
}

/** Nobody, as the dwellers of an empty place (its lore's `empty`): no creatures, no danger. */
export function emptyDweller(def: NonNullable<CellarLore['empty']>['def']): DwellerDef {
  return { ...def, encounter: '', creatures: [], crowd: 0, danger: 0 };
}

/** Nobody lives there (an empty place, a sight to explore). */
export const isEmpty = (c: CellarSketch): boolean => c.dweller.creatures.length === 0;

/** A sketch's history layer of a kind, if it has one. */
export function layerOf(s: CellarSketch, k: HistoryLayer): HistoryEntry | undefined {
  return s.history.find((h) => h.layer === k);
}

const SIZE: Record<Room['size'], readonly [number, number]> = { nook: [2, 2], small: [2, 3], medium: [3, 4], large: [4, 5] };

/** The outline: everything but the meshes. Throws if no layout fits (the variety test keeps that from happening). */
export function outlineCellar(d: DungeonDecision, house: DungeonPlace, lore: CellarLore): Cellar {
  const sketch = sketchCellar(d, house, lore);
  const shape = sketch.form.space;
  const minLevel = depthOf(shape, !!layerOf(sketch, 'older'));
  // Patterns: what the history's layers suggest; the set piece's own for the main cycle when it has one.
  const told = sketch.history.flatMap((h) => h.def.patterns ?? []);
  const known = new Set(PATTERNS.map((p) => p.id));
  const fitting = (ids: readonly string[]) => ids.filter((id) => known.has(id) && (minLevel < 0 || !PATTERNS.find((p) => p.id === id)!.descends));
  const main = fitting(sketch.setPiece.main ?? told);
  const prefer = sketch.setPiece.prefer ?? [];
  const inserts = fitting([...new Set([...told, ...prefer, 'twin-paths', 'side-loop', 'barred-return', 'hidden-shortcut'])]);
  const weight = (id: string) => 0.3 + told.filter((t) => t === id).length + (prefer.includes(id) ? 2 : 0);
  // Entrance: under a house, the house's cellar under its footprint.
  const [ew, ed] = entranceOf(shape, house);
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = deriveSeed(d.seed, 'cellar', 'outline', attempt);
    const graph = cyclicGraph({ main: main.length ? main : fitting(['twin-paths']), inserts, insertCount: [1, 2], maxRooms: shape.maxRooms, minLevel, weight }, seed);
    const link = sketch.setPiece.find(graph);
    if (!link) continue;
    const walk = pace(graph);
    // The way to the goal never needs a hidden door, is more than a step, and has a quicker way back.
    if (walk.needsSecret || !walk.shortcut || new Set(walk.route).size < 3) continue;
    // A tower whose rooms could not all be kept within a flight of each other does not fit its foot: the next.
    if (shape.rise && !climb(graph, walk, shape.rise, minLevel < 0 && !!layerOf(sketch, 'older'))) continue;
    const scale = scaleOf(shape), sizes = shape.rooms ?? SIZE;
    if (shape.ways?.rise) wander(graph, shape.ways.rise, minLevel, new Rng(deriveSeed(seed, 'wander')));
    // A drowned storey that cannot be had (the lair held down there by a drop): the next try's.
    if (shape.flood !== undefined && !drown(graph, walk, minLevel)) continue;
    const cavern = shape.cavern ? cavernOf(graph, walk, new Rng(deriveSeed(seed, 'cavern'))) : -1;
    if (cavern >= 0) graph.rooms[cavern].height = shape.cavern!.height;
    const laid = layoutDungeon(graph, seed, {
      entrance: { x: -(ew >> 1), z: -(ed >> 1), w: ew, d: ed },
      radius: shape.radius,
      stairRun: scale.stairRun,
      maxPath: shape.ways?.longest ?? (shape.rise ? 8 : 6),
      attempts: 6,
      ...(shape.ways ? { gap: shape.ways.gap, turn: shape.ways.turn } : {}),
      size: (room, r) => {
        const [lo, hi] = room.id === cavern ? shape.cavern!.size : sizes[room.size];
        return [r.int(lo, hi), r.int(lo, hi)];
      },
    });
    if (!laid) continue;
    // A natural cave's ways run long between its chambers: too short a cave is the next try's.
    if (shape.ways && waysLength(laid) * scale.cell < shape.ways.least) continue;
    const flood = shape.flood !== undefined ? { flood: laid.levels[0] * scale.storey + shape.flood } : {};
    return furnish(sketch, graph, { ...laid, scale, ...flood }, link.id, new Rng(deriveSeed(seed, 'furnish')), lore);
  }
  throw new Error(`cellar ${d.id}: no layout fits`);
}

/**
 * A natural cave's chambers lie up and down the rock (the water found its own way): each room but the
 * entrance moves up to `rise` storeys from where the graph put it, never below `deepest`; rooms a drop or a
 * grate joins keep theirs (a drop falls onto a ledge one storey down).
 */
function wander(graph: DungeonGraph, rise: number, deepest: number, rng: Rng): void {
  const fixed = new Set(graph.links.filter((l) => l.kind === 'drop' || l.kind === 'grate').flatMap((l) => [l.a, l.b]));
  for (const r of graph.rooms) {
    if (r.id === graph.entrance || fixed.has(r.id)) continue;
    r.level = Math.max(deepest, r.level + rng.int(-rise, rise));
  }
}

/**
 * A sea cave's lowest storey goes under water (`SpaceDef.flood`): the way in, the lair and the safe spot come up
 * off it, and the tensest room on the way to the goal goes down to it, so the way on is dived. Rooms a drop or a
 * grate joins keep their storeys. Each drowned room stands two storeys high: air over its water. False: it cannot be done (a kept room is held down there; nothing on the way).
 */
function drown(graph: DungeonGraph, walk: Pace, deepest: number): boolean {
  const fixed = new Set(graph.links.filter((l) => l.kind === 'drop' || l.kind === 'grate').flatMap((l) => [l.a, l.b]));
  const kept = new Set([graph.entrance, graph.goal, walk.safe].filter((id) => id >= 0));
  for (const id of kept) {
    const r = graph.rooms[id];
    if (r.level > deepest) continue;
    if (fixed.has(id)) return false;
    r.level = deepest + 1;
  }
  if (!graph.rooms.some((r) => r.level <= deepest)) {
    const on = walk.route.filter((id) => !kept.has(id) && !fixed.has(id));
    if (!on.length) return false;
    graph.rooms[on.reduce((a, b) => (walk.tension[b] > walk.tension[a] ? b : a))].level = deepest;
  }
  // A drowned room rises two storeys at least: its ways in are dived, and one comes up in the air over its water.
  for (const r of graph.rooms) if (r.level <= deepest) r.height = Math.max(r.height, 2);
  return true;
}

/** How many cells the ways of a layout run in all. */
export const waysLength = (l: DungeonLayout): number => l.links.reduce((n, pl) => n + pl.path.length, 0);

/**
 * The room that rises into the cave's great cavern: the lair at the end more often, else the room where the
 * goal is first seen (a hall one looks down into), else the tensest room on the way that is not the entrance.
 */
function cavernOf(graph: DungeonGraph, walk: Pace, rng: Rng): number {
  if (walk.reveal >= 0 && walk.reveal !== graph.entrance && rng.chance(0.4)) return walk.reveal;
  if (rng.chance(0.75)) return graph.goal;
  const on = walk.route.filter((r) => r !== graph.entrance && r !== graph.goal);
  return on.length ? on.reduce((a, b) => (walk.tension[b] > walk.tension[a] ? b : a)) : graph.goal;
}

/**
 * A tower's rooms climb: the graph's ways down become ways up (a hall entered over a ledge from a stair up to
 * its gallery), and every room rises by how far along the tension curve it lies (`rise` storeys at most), so
 * the way in starts on the ground and the goal lies near the top. With an older layer, the quietest room
 * off the way goes under the ground instead: the vault at the tower's foot.
 */
function climb(graph: DungeonGraph, walk: Pace, rise: number, older: boolean): boolean {
  for (const r of graph.rooms) {
    if (r.id === graph.entrance) continue;
    r.level = -r.level - (r.height - 1) + Math.round(walk.tension[r.id] * rise);
  }
  // One flight of stairs between linked rooms at most (a narrow tower has no room for more): from the
  // entrance out, a room comes down to within a storey of the room it is reached from.
  const seen = new Set([graph.entrance]), queue = [graph.entrance];
  while (queue.length) {
    const at = graph.rooms[queue.shift()!];
    for (const l of graph.links) {
      if (l.a !== at.id && l.b !== at.id) continue;
      const o = graph.rooms[l.a === at.id ? l.b : l.a];
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      queue.push(o.id);
      // A drop still goes down (the mirror turned it upside down): from the room above onto the ledge of the tall room below.
      if (l.kind === 'drop') o.level = o.id === l.b ? at.level - 1 : at.level + 1;
      else o.level = Math.max(at.level - 1, Math.min(at.level + at.height, o.level));
    }
  }
  // Every link a flight of stairs at most (from either storey of a tall room).
  const gap = (a: Room, b: Room) => Math.max(0, a.level - (b.level + b.height - 1), b.level - (a.level + a.height - 1));
  if (graph.links.some((l) => l.kind !== 'drop' && gap(graph.rooms[l.a], graph.rooms[l.b]) > 1)) return false;
  if (!older) return true;
  // Off the way to the goal, and next to the ground floor only (a stair down from there).
  const on = new Set(walk.route);
  const low = (r: Room) => graph.links.every((l) => (l.a !== r.id && l.b !== r.id) || graph.rooms[l.a === r.id ? l.b : l.a].level === 0);
  const quiet = graph.rooms.filter((r) => r.id !== graph.entrance && r.id !== graph.goal && r.height === 1 && !on.has(r.id) && low(r)).sort((a, b) => walk.tension[a.id] - walk.tension[b.id])[0];
  if (quiet) quiet.level = -1;
  return true;
}

function furnish(sketch: CellarSketch, graph: DungeonGraph, layout: ScaledLayout, pieceLink: number, rng: Rng, lore: CellarLore): Cellar {
  const shape = sketch.form.space, { cell: CELL_M, storey: STOREY_M } = layout.scale;
  const p = pace(graph);
  const useById = new Map(lore.uses.map((u) => [u.id, u]));
  const use = (id: string) => useById.get(id)!;
  const built = layerOf(sketch, 'built')!.def, older = layerOf(sketch, 'older')?.def, trouble = layerOf(sketch, 'trouble')!.def, now = sketch.dweller;
  const piece = sketch.setPiece;
  const link = graph.links.find((l) => l.id === pieceLink)!;
  const pieceRoom = piece.use && useById.has(piece.use.id) ? piece.use.room(graph, link) : -1;

  // Room uses: the entrance is the household's, the goal the dwellers' lair; below lies the older layer;
  // dug rooms are burrows; the safe spot a dry little room; the rest follow the builders, then the troubles
  // and the dwellers.
  const rooms: CellarRoom[] = [];
  const queue = (list: readonly string[]) => { let i = rng.int(0, Math.max(0, list.length - 1)); return () => list[i++ % list.length]; };
  const builderUse = queue(built.uses.slice(1).length ? built.uses.slice(1) : built.uses);
  const olderUse = older ? queue(older.uses) : null;
  const nowUse = queue(now.uses.length ? now.uses : built.uses);
  for (const r of graph.rooms) {
    let u: string, era: HistoryLayer = 'built';
    const t = p.tension[r.id];
    if (r.id === graph.entrance) u = built.uses[0];
    else if (r.id === graph.goal) { u = now.lair; era = 'now'; }
    else if (r.id === p.safe) u = 'refuge';
    else if (r.id === pieceRoom) { u = piece.use!.id; era = piece.use!.era ?? 'trouble'; }
    else if (r.level < 0 && olderUse) { u = olderUse(); era = 'older'; }
    else if (r.tags.includes('dug')) { u = 'burrow'; era = 'now'; }
    else if (r.tags.includes('key') && built.uses.includes('counting-room')) u = 'counting-room';
    else if (trouble.uses.length && rng.chance(0.25)) { u = trouble.uses[0]; era = 'trouble'; }
    else if (t > 0.55 && rng.chance(0.6)) { u = nowUse(); era = 'now'; }
    else u = builderUse();
    rooms.push({ id: r.id, use: use(u), era, tension: t, beat: p.beat[r.id] });
  }

  const props: Prop[] = [];
  const clues: Clue[] = [];
  const doorsOf = (room: number) => layout.links.flatMap((pl) => pl.doors.filter((dr) => dr.room === room));
  const placed = layout.rooms;
  const grid = shape.carved ? new LayoutGrid(layout) : { cells: new Map<string, unknown>() };
  /** Spots along a room's walls (not a doorway's own), as cell + wall side; `put` keeps the floor before doors clear. */
  const wallSpots = (room: number) => {
    const R = placed[room], out: { x: number; z: number; dir: number }[] = [];
    const doors = doorsOf(room).filter((dr) => dr.level === R.level);
    for (let z = R.z; z < R.z + R.d; z++) for (let x = R.x; x < R.x + R.w; x++) for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], nz = z + DIRS[k][1];
      if (cellIn(R, nx, nz)) continue;
      if (doors.some((dr) => dr.x === x && dr.z === z && dr.dir === k)) continue;
      out.push({ x, z, dir: k });
    }
    return out;
  };
  const put = (room: number, kind: DungeonProp, trace?: HistoryLayer, clue?: number): boolean => {
    const R = placed[room];
    const doors = doorsOf(room).filter((dr) => dr.level === R.level);
    const here = props.filter((q) => q.room === room);
    // Against the wall, facing into the room; yaw: −z is 0 (as the walker), facing away from the wall.
    const inset = shape.inset;
    const standAt = (s: { x: number; z: number; dir: number }) => ({
      kind,
      x: (s.x + 0.5) * CELL_M + DIRS[s.dir][0] * (CELL_M / 2 - inset) + rng.range(-0.3, 0.3) * (DIRS[s.dir][1] !== 0 ? 1 : 0),
      z: (s.z + 0.5) * CELL_M + DIRS[s.dir][1] * (CELL_M / 2 - inset) + rng.range(-0.3, 0.3) * (DIRS[s.dir][0] !== 0 ? 1 : 0),
      yaw: Math.atan2(DIRS[s.dir][0], DIRS[s.dir][1]),
    });
    // Where it fits: clear of the doors and of what already stands there.
    const fits = (p: ReturnType<typeof standAt>, doorsClear: boolean) => !(doorsClear && doors.some((d) => blocksDoor(p, d, layout.scale, shape.carved))) && !here.some((q) => propsClash(p, q));
    const roomy = (s: { x: number; z: number }) => !here.some((q) => Math.hypot(q.x - (s.x + 0.5) * CELL_M, q.z - (s.z + 0.5) * CELL_M) < 1.2);
    // A wall of its own if there is one; a full room is crowded (props stand closer), never piled up. The way
    // out must stand somewhere: in a small room with a door in every cell, beside a door.
    const all = wallSpots(room);
    let spot: ReturnType<typeof standAt> | null = null;
    // A carved cave's way out leads on into a throat behind its wall (caveThroat.ts): a wall with free rock behind it first.
    const behind = kind === shape.way && shape.carved ? all.filter((w) => wayOutFree(grid, w.x, w.z, R.level, w.dir)) : [];
    for (const [spots, doorsClear] of [[behind.filter(roomy), true], [behind, true], [all.filter(roomy), true], [all, true], [kind === shape.way ? all : [], false]] as const) {
      for (const s of rng.shuffle(spots.slice())) { const p = standAt(s); if (fits(p, doorsClear)) { spot = p; break; } }
      if (spot) break;
    }
    if (!spot) return false;
    props.push({ ...spot, y: R.level * STOREY_M, room, ...(trace ? { trace } : {}), ...(clue !== undefined ? { clue } : {}) });
    return true;
  };
  // The way out first (the ladder up to the hatch, a tower's door), so nothing stands in front of it.
  put(graph.entrance, shape.way);
  const hatch = props[0];
  // The set piece next (its clues must find a place): its own dressing and its clues.
  piece.dress({ link, graph, rooms, trouble, dweller: now, rng, put, clue: (text, room, l) => { clues.push({ text, room, ...(l !== undefined ? { link: l } : {}) }); return clues.length - 1; } });
  // Traces of history: each layer's in the rooms of its time, the dwellers' also near the entrance (foreshadowing).
  for (const h of sketch.history) for (const kind of h.def.traces ?? []) {
    const own = rooms.filter((r) => r.era === h.layer);
    const where = h.layer === 'now' ? rooms.filter((r) => r.beat === 'foreshadow' || r.era === 'now') : own.length ? own : rooms.filter((r) => r.id !== graph.goal);
    // Two of each, in rooms that have a free wall (a small room full of doors may have none).
    for (let i = 0, tries = 0; i < 2 && tries < where.length * 2; tries++) if (put(where[rng.int(0, where.length - 1)].id, kind, h.layer)) i++;
  }
  // Then what each room is used for, as far as its walls hold.
  for (const r of rooms) {
    const R = placed[r.id], n = Math.max(2, Math.min(7, Math.round(R.w * R.d * 0.45)));
    for (let i = 0; i < n; i++) put(r.id, r.use.props[i % r.use.props.length]);
  }

  // The builders' ledger often tells of the older layer (a clue for those who read).
  const lower = layerOf(sketch, 'older');
  if (lower && rng.chance(0.7)) {
    // Only if a ledger finds a place to lie (a clue nothing tells is no clue).
    if (put(graph.entrance, 'ledger', 'built', clues.length)) clues.push({ text: `An old note in the ledger: "${lower.text}"`, room: graph.entrance });
  }

  // Who lives where draws from its own stream, so how the rooms are dressed never changes it.
  const spawns = settle(graph, p, rooms, now, new Rng(deriveSeed(sketch.decision.seed, 'settle')), drownedRooms(layout));

  const form = layout.rooms.map((r) => `${r.w}x${r.d}x${r.height}@${r.level}`).sort().join(',');
  const signature = `${graph.patterns.join('+')}|${graph.rooms.length}r${graph.links.length}l|${form}`;
  return { ...sketch, graph, pace: p, layout, rooms, props, clues, spawns, pieceLink, hatch, signature };
}

/**
 * Who lives where (small and dense, plan 8.1): the lair holds most; the two tensest rooms on the way hold
 * a group each, as many as the dwellers crowd into a room; the entrance, the safe spot and the rooms under
 * water (`drowned`) are quiet.
 */
function settle(graph: DungeonGraph, p: Pace, rooms: readonly CellarRoom[], now: DwellerDef, rng: Rng, drowned: ReadonlySet<number>): Spawn[] {
  const spawns: Spawn[] = [];
  if (!now.creatures.length) return spawns;
  const [lead, ...rest] = now.creatures;
  const other = () => (rest.length && rng.chance(0.6) ? rest[0] : lead);
  spawns.push({ creature: lead, room: graph.goal });
  for (let i = 1; i < Math.min(now.crowd, 2); i++) spawns.push({ creature: other(), room: graph.goal });
  const held = rooms.filter((r) => r.id !== graph.goal && r.id !== p.safe && r.id !== graph.entrance && !drowned.has(r.id) && r.tension >= 0.35).sort((a, b) => b.tension - a.tension).slice(0, 2);
  for (const r of held) {
    const n = r.tension > 0.7 ? now.crowd : Math.ceil(now.crowd / 2);
    for (let i = 0; i < n; i++) spawns.push({ creature: other(), room: r.id });
  }
  if (now.surprise && rng.chance(0.5)) {
    const i = spawns.findIndex((s) => s.room !== graph.goal);
    if (i >= 0) spawns[i] = { ...spawns[i], surprise: now.surprise };
  }
  return spawns;
}

/**
 * New dwellers in a cleared cellar (plan 8.1, D10: repopulation as a story event): the layout, the rooms
 * and what stands in them stay (the old dwellers' leavings too); who lives there and the story of it are
 * the move-in's.
 */
export function moveIn(c: Cellar, moved: MoveInDecision | RetakeDecision, house: DungeonPlace, lore: CellarLore): Cellar {
  const sketch = sketchCellar(c.decision, house, lore, moved);
  const spawns = settle(c.graph, c.pace, c.rooms, sketch.dweller, new Rng(deriveSeed(moved.seed, 'move-in')), drownedRooms(c.layout));
  return { ...c, ...sketch, spawns };
}

/** The id the cellar's dwellers go by in the journal, the talk and the save: the move-in's, else the dungeon's. */
export const occupantId = (c: CellarSketch): string => c.occupation?.id ?? c.decision.id;
