/**
 * The loop check delves the formed caves (D63, phase K5): in each of the five kinds of cave (three solution rocks, lava tubes, mines)
 * on several seeds, the game's own Walker goes in from the way in to the deepest place the reader found and back out to the way in,
 * along the network the reader read off the carved rock, with the hero's own limits (steps, climbs, drops). A cave passes when the
 * walker reaches the deepest place and gets back. Headless: the field of the cave is the game's (world/cave/*, game/formedWorld.ts).
 * `npm run loop:caves [-- seeds]` (`VERBOSE=1` lists every cave; `STRICT=1` exits 1 when fewer than `PASS` of a kind pass).
 *
 * NOT in `npm run loop` yet (2026-11-02): the scripted walker (it pushes towards the next cell, strafes not) is stopped by the
 * climbs of 2 m and more that the reader allows (a rise of 1.2 m or less: 90 % walked; up to 2 m: 63 %; up to 3 m: 30 %; over 4 m: 10 %),
 * so the solution caves fail and the mines and lava tubes mostly pass. What fails: the hero hangs on a rough face whose holds end under
 * a roof's lip, or whose ledge lies along the face rather than on it. Fixing that (a firmer climb along a face, or rubble ramps where the
 * carver meets a tall climb) is the K5 "tall climbs" item; this check is its measure, and joins the loop when it holds.
 */
import { classic } from '../../src/setting/classic/index';
import { Walker } from '../../src/game/walker';
import { caveWater } from '../../src/world/cave/water';
import { formedWorld } from '../../src/game/formedWorld';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';
import { reachFree, type Reading } from '../../src/world/cave/reader';
import type { BrickField } from '../../src/world/dungeon/rockMesh';

const caves = classic.caves!, seeds = Number(process.argv[2] ?? 6);
/** The block's size for the check (a little under the smallest cave, as the unit tests': the walk is the same, the check is quicker). */
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
/** Share of caves of a kind that must be walked in and out. */
const PASS = 0.8;
/** Seconds of play for a way, at most. */
const LIMIT = 150;

/** The cells of the way from the tree's start to `to`. */
const wayTo = (from: Int32Array, to: number): number[] => { const out: number[] = []; for (let k = to; k >= 0; k = from[k]) out.unshift(k); return out; };

/** Walk `w` along the cells of a path (reader cells), true when it reached the last one. */
function follow(w: Walker, r: Reading, cells: readonly number[]): boolean {
  const stuck = (k: number, why: string): false => { if (process.env.WHY) { const a = cells[k - 1], c = cells[k], e = [...Array(r.edgeStart[a + 1] - r.edgeStart[a]).keys()].map((n) => r.edgeStart[a] + n).find((n) => r.edgeTo[n] === c); console.log(`    stuck ${why} at step ${k}/${cells.length}: link ${e === undefined ? '?' : ['walk', 'climb', 'drop', 'swim'][r.edgeKind[e]]}, rise ${(r.y[c] - r.y[a]).toFixed(2)}, run ${Math.hypot(r.x[c] - r.x[a], r.z[c] - r.z[a]).toFixed(2)}, hero at ${(w.pos.y - r.y[a]).toFixed(2)} above the cell, ${near(r.x[c], r.y[c], r.z[c]).toFixed(1)} m from an opened way`); } if (process.env.WHY === '2') for (let q = Math.max(0, k - 4); q <= Math.min(cells.length - 1, k + 1); q++) console.log(`      cell ${q}: ${r.x[cells[q]].toFixed(1)} ${r.y[cells[q]].toFixed(2)} ${r.z[cells[q]].toFixed(1)} room ${r.room[cells[q]].toFixed(1)}`); if (process.env.WHY === '2') console.log(`      hero ${w.pos.x.toFixed(1)} ${w.pos.y.toFixed(2)} ${w.pos.z.toFixed(1)}`); return false; };
  let t = 0;
  for (let k = 1; k < cells.length; k++) {
    const c = cells[k], from = cells[k - 1], swim = [...Array(r.edgeStart[from + 1] - r.edgeStart[from]).keys()].some((n) => r.edgeTo[r.edgeStart[from] + n] === c && r.edgeKind[r.edgeStart[from] + n] === 3);
    for (let spent = 0; spent < 60 * 12; spent++, t++) {
      if (t > 60 * LIMIT) return stuck(k, 'out of time');
      const dx = r.x[c] - w.pos.x, dz = r.z[c] - w.pos.z, near = Math.hypot(dx, dz) < 0.4 && Math.abs(r.y[c] - w.pos.y) < 0.8;
      if (near) break;
      // A swim under a sump's lid is a dive: down while far from the far bank, up when near it.
      const far = Math.hypot(dx, dz);
      // (Dive first, then on: a sump's lid starts at the surface, so the swimmer goes down before it and under.)
      const diving = swim && far >= 3 && w.mode === 'swim', sunk = w.pos.y < r.y[from] - 1.2;
      w.step({ forward: diving && !sunk ? 0 : 1, strafe: 0, heading: Math.atan2(-dx, -dz), walk: false, up: swim && far < 3, down: diving }, 1 / 60);
      if (spent === 60 * 12 - 1) return stuck(k, 'timeout');
    }
  }
  return true;
}

let failed = false, opened: readonly { a: readonly number[]; b: readonly number[] }[] = [];
const near = (x: number, y: number, z: number): number => Math.min(99, ...opened.map(({ a, b }) => { const dx = b[0] - a[0], dz = b[2] - a[2], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t, (y - a[1] - (b[1] - a[1]) * t) / 2); }));
const rocks = ['massive', 'jointed', 'thin-bedded', 'basalt', 'hard-rock'];
for (const rock of rocks) {
  let passed = 0;
  const lines: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), r = readFormed(c, caves, dressFormed(c, caves)), g = r.reading;
    opened = r.opened;
    if (g.entries[0] === undefined) { lines.push(`  ${rock} ${seed}: no way in`); continue; }
    // The deepest place the reader found (a dead end, a void or an alcove) that is reached over no tall face, by metres of way from its nearest way in.
    const free = reachFree(g, caves.way.ramp.above, g.entries);
    let deep = g.entries[0];
    for (const p of g.places) if (p.depth > g.depth[deep] && free.reached[p.cell]) deep = p.cell;
    const inward = wayTo(free.from, deep);
    // Back out: the way from the deepest place to a way in (drops cannot be climbed, so it is not the inward way reversed).
    const home = reachFree(g, caves.way.ramp.above, [deep]), out = g.entries.filter((e) => home.reached[e]).sort((a, b) => g.depth[a] - g.depth[b])[0];
    const outward = out === undefined ? null : wayTo(home.from, out);
    const entry = inward[0], w = new Walker(formedWorld(c.field as BrickField, undefined, caveWater(r.dressing, caves.dress.water.bed, caves.dress.water.poolDepth), r.dressing.ladders));
    w.place(g.x[entry], g.z[entry], g.y[entry] + 0.02);
    const went = follow(w, g, inward);
        const ok = went && outward !== null && follow(w, g, outward);
    if (ok) passed++;
    lines.push(`  ${rock} ${seed}: ${ok ? 'in and out' : went ? 'in, but not back out' : 'did not get in'} (${inward.length} cells, ${g.depth[deep].toFixed(0)} m deep, ${(100 * free.reached.reduce((n, v) => n + v, 0) / g.count).toFixed(0)} % of the cave free of tall faces)`);
  }
  const share = passed / seeds;
  console.log(`${rock}: ${passed} of ${seeds} caves walked in and out`);
  for (const l of lines) if (share < 1 || process.env.VERBOSE) console.log(l);
  if (share < PASS && process.env.STRICT) { failed = true; console.log(`FAILED: ${rock} caves walked in and out ${(share * 100).toFixed(0)} % of the time, under ${(PASS * 100).toFixed(0)} %`); }
}
if (failed) process.exit(1);
console.log(process.env.STRICT ? 'the caves can be delved' : 'measured (STRICT=1 to hold the caves to it)');
