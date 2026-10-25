/**
 * A cellar dungeon (plan 8, milestone 3) from its decision, in the promise's stages (plan 4.2):
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
import { cyclicGraph, layoutDungeon, pace, PATTERNS, DIRS, type DungeonGraph, type DungeonLayout, type Pace, type Room } from '@futuremagic/dungeon';
import type { TownBuilding } from '@futuremagic/settlement';
import type { CellarLore, DungeonProp, DwellerDef, HistoryDef, RoomUseDef } from '../../setting/contract';
import type { DungeonDecision } from '../decisions';
import { setPieceById, type SetPieceDef } from './setPieces';

/** Metres per layout cell, per storey, and stairs per storey (cells). */
export const CELL = 2;
export const STOREY = 2.8;
export const STAIR_RUN = 2;

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
  /** Oldest first: what lay there before, who built the cellar, what went wrong, who is there now. */
  readonly history: HistoryEntry[];
  readonly dweller: DwellerDef;
  readonly setPiece: SetPieceDef;
  /** What the household above can tell (plan 9: the hint), in their words. */
  readonly hints: string[];
  readonly facts: Fact[];
  /** Who in town would know: the household of this building of this town. */
  readonly knownBy: { readonly town: string; readonly building: number };
  /** The house above, as people call it ("the inn"). */
  readonly house: string;
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

export interface Spawn {
  readonly creature: string;
  readonly room: number;
  /** The one who breaks expectations (plan 8.1), if any. */
  readonly surprise?: string;
}

export interface Cellar extends CellarSketch {
  readonly graph: DungeonGraph;
  readonly pace: Pace;
  readonly layout: DungeonLayout;
  readonly rooms: CellarRoom[];
  readonly props: Prop[];
  readonly clues: Clue[];
  readonly spawns: Spawn[];
  /** The link the set piece hangs on. */
  readonly pieceLink: number;
  /** The way up to the house: the ladder under the hatch (a prop in the entrance room). */
  readonly hatch: Prop;
  /** For variety checks: what makes this cellar's shape. */
  readonly signature: string;
}

/** How people call a building ("the cottage", "the cooper's workshop"). */
export const houseName = (b: TownBuilding): string =>
  b.kind === 'house' || b.kind === 'cottage' ? `the ${b.kind}` : b.kind === 'workshop' && b.trade ? `the ${b.trade}'s workshop` : `the ${b.kind}`;

const pickDef = <T extends HistoryDef>(rng: Rng, list: readonly T[], ok: (d: T) => boolean = () => true): T => {
  const c = list.filter(ok);
  return rng.weighted(c.length ? c : list, (d) => d.weight ?? 1);
};

/** The sketch: history, hints and facts (no layout). */
export function sketchCellar(d: DungeonDecision, house: TownBuilding, lore: CellarLore): CellarSketch {
  const rng = new Rng(deriveSeed(d.seed, 'cellar', 'history'));
  const piece = setPieceById(d.setPiece);
  const name = houseName(house);
  const fits = (b: HistoryDef) => (house.kind === 'inn' ? ['wine-merchant', 'brewer'].includes(b.id) : house.kind === 'bakery' ? b.id === 'chandler' : true);
  const builder = pickDef(rng, lore.builders, fits);
  const older = piece.older || rng.chance(0.65) ? pickDef(rng, lore.older) : null;
  const trouble = pickDef(rng, lore.troubles, (t) => !piece.troubles || piece.troubles.includes(t.id));
  const ids = [builder.id, older?.id, trouble.id].filter(Boolean) as string[];
  // Who moves in fits the history and the place's danger (D29: fixed by where it lies, not by the hero).
  const dweller = pickDef(rng, lore.dwellers, (w) => (!w.with || w.with.some((x) => ids.includes(x))) && w.danger <= (d.danger ?? Infinity));
  const line = (def: HistoryDef) => def.text.replaceAll('{house}', name);
  const history: HistoryEntry[] = [];
  if (older) history.push({ layer: 'older', def: older, text: line(older) });
  history.push({ layer: 'built', def: builder, text: line(builder) }, { layer: 'trouble', def: trouble, text: line(trouble) }, { layer: 'now', def: dweller, text: line(dweller) });
  const hints = [...dweller.signs, `They say ${line(trouble).charAt(0).toLowerCase()}${line(trouble).slice(1)}`];
  const facts: Fact[] = [
    [d.id, 'is under', `${d.town}/building/${d.building}`],
    [d.id, 'was dug by', builder.id],
    [d.id, 'suffered', trouble.id],
    [d.id, 'is home to', dweller.id],
  ];
  if (older) facts.push([d.id, 'lies over', older.id]);
  return { decision: d, history, dweller, setPiece: piece, hints, facts, knownBy: { town: d.town, building: d.building }, house: name };
}

/** A sketch's history layer of a kind, if it has one. */
export function layerOf(s: CellarSketch, k: HistoryLayer): HistoryEntry | undefined {
  return s.history.find((h) => h.layer === k);
}

const SIZE: Record<Room['size'], readonly [number, number]> = { nook: [2, 2], small: [2, 3], medium: [3, 4], large: [4, 5] };

/** The outline: everything but the meshes. Throws if no layout fits (the variety test keeps that from happening). */
export function outlineCellar(d: DungeonDecision, house: TownBuilding, lore: CellarLore): Cellar {
  const sketch = sketchCellar(d, house, lore);
  const minLevel = layerOf(sketch, 'older') ? -1 : 0;
  // Patterns: what the history's layers suggest; the set piece's own for the main cycle when it has one.
  const told = sketch.history.flatMap((h) => h.def.patterns ?? []);
  const known = new Set(PATTERNS.map((p) => p.id));
  const fitting = (ids: readonly string[]) => ids.filter((id) => known.has(id) && (minLevel < 0 || !PATTERNS.find((p) => p.id === id)!.descends));
  const main = fitting(sketch.setPiece.main ?? told);
  const inserts = fitting([...new Set([...told, 'twin-paths', 'side-loop', 'barred-return', 'hidden-shortcut'])]);
  const prefer = sketch.setPiece.prefer ?? [];
  const weight = (id: string) => 0.3 + told.filter((t) => t === id).length + (prefer.includes(id) ? 2 : 0);
  // Entrance: the house's cellar under its footprint.
  const ew = Math.max(2, Math.min(5, Math.floor(house.hu))), ed = Math.max(2, Math.min(5, Math.floor(house.hv)));
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = deriveSeed(d.seed, 'cellar', 'outline', attempt);
    const graph = cyclicGraph({ main: main.length ? main : fitting(['twin-paths']), inserts, insertCount: [1, 2], maxRooms: 11, minLevel, weight }, seed);
    const link = sketch.setPiece.find(graph);
    if (!link) continue;
    const walk = pace(graph);
    // The way to the goal never needs a hidden door, and is more than a step.
    if (walk.needsSecret || new Set(walk.route).size < 3) continue;
    const layout = layoutDungeon(graph, seed, {
      entrance: { x: -(ew >> 1), z: -(ed >> 1), w: ew, d: ed },
      radius: 16,
      stairRun: STAIR_RUN,
      maxPath: 6,
      attempts: 6,
      size: (room, r) => { const [lo, hi] = SIZE[room.size]; return [r.int(lo, hi), r.int(lo, hi)]; },
    });
    if (!layout) continue;
    return furnish(sketch, graph, layout, link.id, new Rng(deriveSeed(seed, 'furnish')), lore);
  }
  throw new Error(`cellar ${d.id}: no layout fits`);
}

function furnish(sketch: CellarSketch, graph: DungeonGraph, layout: DungeonLayout, pieceLink: number, rng: Rng, lore: CellarLore): Cellar {
  const p = pace(graph);
  const useById = new Map(lore.uses.map((u) => [u.id, u]));
  const use = (id: string) => useById.get(id)!;
  const built = layerOf(sketch, 'built')!.def, older = layerOf(sketch, 'older')?.def, trouble = layerOf(sketch, 'trouble')!.def, now = sketch.dweller;
  const piece = sketch.setPiece;
  const link = graph.links.find((l) => l.id === pieceLink)!;

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
    else if (piece.id === 'broken-floor' && r.id === link.a) { u = 'collapse'; era = 'trouble'; }
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
  /** Free spots along a room's walls (not in front of doors), as cell + wall side. */
  const wallSpots = (room: number) => {
    const R = placed[room], out: { x: number; z: number; dir: number }[] = [];
    const doors = doorsOf(room).filter((dr) => dr.level === R.level);
    for (let z = R.z; z < R.z + R.d; z++) for (let x = R.x; x < R.x + R.w; x++) for (let k = 0; k < 4; k++) {
      const nx = x + DIRS[k][0], nz = z + DIRS[k][1];
      if (nx >= R.x && nx < R.x + R.w && nz >= R.z && nz < R.z + R.d) continue;
      if (doors.some((dr) => dr.x === x && dr.z === z)) continue;
      out.push({ x, z, dir: k });
    }
    return out;
  };
  const put = (room: number, kind: DungeonProp, trace?: HistoryLayer, clue?: number) => {
    const R = placed[room];
    const clear = (s: { x: number; z: number }) => !props.some((q) => q.room === room && Math.hypot(q.x - (s.x + 0.5) * CELL, q.z - (s.z + 0.5) * CELL) < 1.2);
    let spots = wallSpots(room).filter(clear);
    // A full room: crowd it (props may stand closer).
    if (!spots.length) spots = wallSpots(room);
    if (!spots.length) return;
    const s = spots[rng.int(0, spots.length - 1)];
    // Against the wall, facing into the room; yaw: −z is 0 (as the walker), facing away from the wall.
    const inset = 0.55;
    const x = (s.x + 0.5) * CELL + DIRS[s.dir][0] * (CELL / 2 - inset) + rng.range(-0.3, 0.3) * (DIRS[s.dir][1] !== 0 ? 1 : 0);
    const z = (s.z + 0.5) * CELL + DIRS[s.dir][1] * (CELL / 2 - inset) + rng.range(-0.3, 0.3) * (DIRS[s.dir][0] !== 0 ? 1 : 0);
    const yaw = Math.atan2(DIRS[s.dir][0], DIRS[s.dir][1]);
    props.push({ kind, x, z, y: R.level * STOREY, yaw, room, ...(trace ? { trace } : {}), ...(clue !== undefined ? { clue } : {}) });
  };
  // The ladder up to the hatch first, so nothing stands in front of it.
  put(graph.entrance, 'ladder');
  const hatch = props[0];
  for (const r of rooms) {
    const R = placed[r.id], n = Math.max(2, Math.min(7, Math.round(R.w * R.d * 0.45)));
    for (let i = 0; i < n; i++) put(r.id, r.use.props[i % r.use.props.length]);
  }
  // Traces of history: each layer's in the rooms of its time, the dwellers' also near the entrance (foreshadowing).
  for (const h of sketch.history) for (const kind of h.def.traces ?? []) {
    const own = rooms.filter((r) => r.era === h.layer);
    const where = h.layer === 'now' ? rooms.filter((r) => r.beat === 'foreshadow' || r.era === 'now') : own.length ? own : rooms.filter((r) => r.id !== graph.goal);
    for (let i = 0; i < 2 && where.length; i++) put(where[rng.int(0, where.length - 1)].id, kind, h.layer);
  }

  // The set piece: its own dressing and its clues.
  if (piece.id === 'broken-floor') {
    clues.push({ text: 'The boards end in splinters over a drop. Far below, an older hall: stone, not timber. Someone lives down there.', room: link.a, link: link.id });
    put(link.a, 'rubble', 'trouble', clues.length - 1); put(link.a, 'beam', 'trouble');
    put(link.b, 'rubble', 'trouble'); put(link.b, 'beam', 'trouble');
  } else if (piece.id === 'bricked-wall') {
    const hidden = link.b;
    const by = trouble.id === 'debt' ? 'the owner, the week before he fled' : 'the household, the summer of the sickness';
    clues.push({ text: `The mortar on this stretch of wall is paler than the rest, and it rings hollow under a knock.`, room: hidden, link: link.id });
    const ledgerRoom = rooms.find((r) => r.use.id === 'counting-room')?.id ?? graph.entrance;
    clues.push({ text: `A ledger: "To the mason, for bricking the north wall below, three silver." Paid by ${by}. The house has no such wall on any plan.`, room: ledgerRoom, link: link.id });
    put(hidden, 'bricks', 'trouble', clues.length - 2);
    put(ledgerRoom, 'ledger', 'trouble', clues.length - 1);
  }
  // The builders' ledger often tells of the older layer (a clue for those who read).
  const lower = layerOf(sketch, 'older');
  if (lower && rng.chance(0.7)) {
    clues.push({ text: `An old note in the ledger: "${lower.text}"`, room: graph.entrance });
    put(graph.entrance, 'ledger', 'built', clues.length - 1);
  }

  // Who lives where (small and dense, plan 8.1): the lair holds most; the two tensest rooms on the way hold
  // a group each, as many as the dwellers crowd into a room; the entrance and the safe spot are quiet.
  const spawns: Spawn[] = [];
  const [lead, ...rest] = now.creatures;
  const other = () => (rest.length && rng.chance(0.6) ? rest[0] : lead);
  spawns.push({ creature: lead, room: graph.goal });
  for (let i = 1; i < Math.min(now.crowd, 2); i++) spawns.push({ creature: other(), room: graph.goal });
  const held = rooms.filter((r) => r.id !== graph.goal && r.id !== p.safe && r.id !== graph.entrance && r.tension >= 0.35).sort((a, b) => b.tension - a.tension).slice(0, 2);
  for (const r of held) {
    const n = r.tension > 0.7 ? now.crowd : Math.ceil(now.crowd / 2);
    for (let i = 0; i < n; i++) spawns.push({ creature: other(), room: r.id });
  }
  if (now.surprise && rng.chance(0.5)) {
    const i = spawns.findIndex((s) => s.room !== graph.goal);
    if (i >= 0) spawns[i] = { ...spawns[i], surprise: now.surprise };
  }

  const shape = layout.rooms.map((r) => `${r.w}x${r.d}x${r.height}@${r.level}`).sort().join(',');
  const signature = `${graph.patterns.join('+')}|${graph.rooms.length}r${graph.links.length}l|${shape}`;
  return { ...sketch, graph, pace: p, layout, rooms, props, clues, spawns, pieceLink, hatch, signature };
}
