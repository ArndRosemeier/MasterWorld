/**
 * A cellar's story told in a formed cave (D63, phase K5; the VGM's tool for putting a place's household of dwellers and
 * things into the natural cave, D51): the cellar outline gives rooms (the way in, the lair, rooms between), what lives in
 * each, the props, the chests and the clues. In a formed cave there are no rooms, only the places the reader found
 * (world/cave/reader.ts), so each room gets a place as its home: the way in at the throat, the lair at the deepest big
 * hall or dead end, the great cavern in the biggest void, the rest spread along the way by how far they lie in the story.
 * Props are set down on the floor round their room's home, turned to the nearest wall. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { FormedGround } from '../sim/formedGround';
import type { Reading, Place } from '../world/cave/reader';
import type { Cellar, Prop } from '../world/dungeon/cellar';
import type { ThroatFrame } from '../world/dungeon/caveThroat';
import { fieldAt, type BrickField } from '../world/dungeon/rockMesh';

/** Places that can be a room's home, and how far apart two homes lie at least (m). */
const HOMES = new Set<Place['kind']>(['void', 'deadEnd', 'alcove', 'junction', 'ledge', 'bank']);
const APART = 12;
/** Props set down on a floor keep this far from one another (m). */
const CLEAR = 0.9;
/** A home has at least this many cells to live on round it (about 10 m2 of floor). */
const ROOMY = 30;
/** Under a skylight the daylight hangs this high over the floor (m), as a natural cave's shaft does (world/dungeon/torches.ts). */
const SHAFT_UP = 7;

/** A cellar whose rooms are homes in a formed cave, and the ground its dwellers walk. */
export interface Inhabited {
  readonly cellar: Cellar;
  readonly ground: FormedGround;
  /** The reading's cell of each room's home. */
  readonly cells: readonly number[];
}

/** How many rooms away from the entrance each room lies in the story (by its links). */
function storyDepth(c: Cellar): number[] {
  const n = c.graph.rooms.length, d = new Array<number>(n).fill(-1), q = [c.graph.entrance];
  d[c.graph.entrance] = 0;
  for (let i = 0; i < q.length; i++) for (const l of c.graph.links) {
    const a = q[i], b = l.a === a ? l.b : l.b === a ? l.a : -1;
    if (b >= 0 && d[b] < 0) { d[b] = d[a] + 1; q.push(b); }
  }
  return d.map((v) => (v < 0 ? 1 : v));
}

/** The home cell of every room (by room id). */
function homesOf(c: Cellar, r: Reading, field: BrickField): number[] {
  const rooms = c.graph.rooms.length, depth = storyDepth(c), far = Math.max(1, ...depth);
  // Homes with room to live in: ground that a creature goes about for a few metres (not a niche of one cell).
  const probe = new FormedGround(field, r, []);
  const roomy = r.places.filter((p) => HOMES.has(p.kind) && r.depth[p.cell] < Infinity && r.back[p.cell] && probe.surround(p.cell).length >= ROOMY);
  const places = (roomy.length >= rooms ? roomy : r.places.filter((p) => HOMES.has(p.kind) && r.depth[p.cell] < Infinity && r.back[p.cell])).sort((a, b) => a.depth - b.depth || a.cell - b.cell);
  const cells = new Array<number>(rooms).fill(-1), used: Place[] = [];
  const assign = (room: number, p: Place): void => { cells[room] = p.cell; used.push(p); };
  const free = (p: Place, apart: number): boolean => used.every((u) => Math.hypot(u.x - p.x, u.z - p.z) + Math.abs(u.y - p.y) >= apart);
  // The way in is the throat; the lair the deepest big hall (else the deepest end).
  const entry = r.entries[0] ?? 0;
  cells[c.graph.entrance] = entry;
  used.push({ kind: 'entry', cell: entry, x: r.x[entry], y: r.y[entry], z: r.z[entry], depth: 0, radius: 0 });
  const score = (p: Place): number => p.depth + 6 * Math.min(8, p.radius);
  const goal = places.filter((p) => p.kind === 'void' || p.kind === 'deadEnd').sort((a, b) => score(b) - score(a) || a.cell - b.cell)[0] ?? places[places.length - 1];
  if (goal) assign(c.graph.goal, goal);
  // The great cavern in the biggest hall left.
  const cavern = c.rooms.findIndex((room) => room.use.id === 'cavern');
  if (cavern >= 0 && cells[cavern] < 0) {
    const hall = places.filter((p) => p.kind === 'void' && free(p, APART)).sort((a, b) => b.radius - a.radius || a.cell - b.cell)[0];
    if (hall) assign(cavern, hall);
  }
  // The rest along the way, by how far into the story they lie.
  const goalDepth = goal ? goal.depth : 1;
  const rest = c.graph.rooms.map((room) => room.id).filter((id) => cells[id] < 0).sort((a, b) => depth[a] - depth[b] || a - b);
  for (const id of rest) {
    const want = (depth[id] / far) * goalDepth;
    const pick = (apart: number): Place | undefined => places.filter((p) => free(p, apart)).sort((a, b) => Math.abs(a.depth - want) - Math.abs(b.depth - want) || a.cell - b.cell)[0];
    const p = pick(APART) ?? pick(APART / 3) ?? pick(0);
    if (p) assign(id, p);
    else cells[id] = entry;
  }
  return cells;
}

/** Turn towards the nearest rock: the yaw of the wall closest to a floor point (a walker's yaw convention, as props use). */
function towardWall(f: BrickField, x: number, y: number, z: number, rng: Rng): number {
  let best = rng.range(-Math.PI, Math.PI), near = 1.6;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6, d = fieldAt(f, x + Math.sin(a) * 1.2, y + 0.7, z + Math.cos(a) * 1.2, -1);
    if (d < near) { near = d; best = a; }
  }
  return best;
}

/** Put a cellar's rooms, props and dwellers into a formed cave. */
export function inhabit(cellar: Cellar, field: BrickField, reading: Reading, throat?: ThroatFrame): Inhabited {
  const cells = homesOf(cellar, reading, field), ground = new FormedGround(field, reading, cells);
  const rng = new Rng(deriveSeed(cellar.decision.seed, 'cave', 'inhabit'));
  const homes = cells.map((c) => ({ x: reading.x[c], y: reading.y[c], z: reading.z[c] }));
  // Daylight under each skylight: the cavern's shaft lights its floor in a pool.
  const glows = reading.places.filter((p) => p.kind === 'skylight').map((p) => ({ x: p.x, y: p.y + SHAFT_UP, z: p.z }));
  const placed: Prop[] = [];
  const roomAt = (a: { x: number; z: number }): number => placed.reduce((m, q) => Math.min(m, Math.hypot(q.x - a.x, q.z - a.z)), Infinity);
  const setDown = (p: Prop): Prop => {
    // A spot of its room's home clear of the other props (the roomiest of a few tries if the home is crowded).
    let at = ground.spot(p.room, rng), room = roomAt(at);
    for (let n = 0; n < 24 && room < CLEAR; n++) { const t = ground.spot(p.room, rng), r = roomAt(t); if (r > room) { at = t; room = r; } }
    const out: Prop = { ...p, x: at.x, y: at.y, z: at.z, yaw: towardWall(field, at.x, at.y, at.z, rng) };
    placed.push(out);
    return out;
  };
  // The way out stands at the throat (the entry cell, facing in).
  const e = reading.entries[0] ?? cells[cellar.graph.entrance];
  const hatch: Prop = { ...cellar.hatch, x: reading.x[e], y: reading.y[e], z: reading.z[e], ...(throat ? { yaw: throat.yaw } : {}) };
  const props = cellar.props.map((p) => (p === cellar.hatch ? hatch : setDown(p)));
  return { cellar: { ...cellar, props, hatch, formed: { homes, glows } }, ground, cells };
}
