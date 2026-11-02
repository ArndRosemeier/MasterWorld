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
import { formedWorld } from '../../src/game/formedWorld';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';
import { pathTo, type Reading } from '../../src/world/cave/reader';
import type { BrickField } from '../../src/world/dungeon/rockMesh';

const caves = classic.caves!, seeds = Number(process.argv[2] ?? 6);
/** The block's size for the check (a little under the smallest cave, as the unit tests': the walk is the same, the check is quicker). */
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
/** Share of caves of a kind that must be walked in and out. */
const PASS = 0.8;
/** Seconds of play for a way, at most. */
const LIMIT = 150;

/** Walk `w` along the cells of a path (reader cells), true when it reached the last one. */
function follow(w: Walker, r: Reading, cells: readonly number[]): boolean {
  let t = 0;
  for (let k = 1; k < cells.length; k++) {
    const c = cells[k];
    for (let spent = 0; spent < 60 * 12; spent++, t++) {
      if (t > 60 * LIMIT) return false;
      const dx = r.x[c] - w.pos.x, dz = r.z[c] - w.pos.z, near = Math.hypot(dx, dz) < 0.4 && Math.abs(r.y[c] - w.pos.y) < 0.8;
      if (near) break;
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-dx, -dz), walk: false, up: false, down: false }, 1 / 60);
      if (spent === 60 * 12 - 1) return false;
    }
  }
  return true;
}

let failed = false;
const rocks = ['massive', 'jointed', 'thin-bedded', 'basalt', 'hard-rock'];
for (const rock of rocks) {
  let passed = 0;
  const lines: string[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), r = readFormed(c, caves, dressFormed(c, caves)), g = r.reading;
    if (g.entries[0] === undefined) { lines.push(`  ${rock} ${seed}: no way in`); continue; }
    // The deepest place the reader found (a dead end, a void or an alcove), by metres of way from its nearest way in.
    let deep = g.entries[0];
    for (const p of g.places) if (p.depth > g.depth[deep] && g.depth[p.cell] < Infinity) deep = p.cell;
    const inward = pathTo(g, deep), entry = inward[0], w = new Walker(formedWorld(c.field as BrickField));
    w.place(g.x[entry], g.z[entry], g.y[entry] + 0.02);
    const went = follow(w, g, inward);
    // Back out along the way it came (the reader's way back: every cell on a path from the way in can be walked out unless a climb or drop stands in it).
    const ok = went && follow(w, g, [...inward].reverse());
    if (ok) passed++;
    lines.push(`  ${rock} ${seed}: ${ok ? 'in and out' : went ? 'in, but not back out' : 'did not get in'} (${inward.length} cells, ${g.depth[deep].toFixed(0)} m deep)`);
  }
  const share = passed / seeds;
  console.log(`${rock}: ${passed} of ${seeds} caves walked in and out`);
  for (const l of lines) if (share < 1 || process.env.VERBOSE) console.log(l);
  if (share < PASS && process.env.STRICT) { failed = true; console.log(`FAILED: ${rock} caves walked in and out ${(share * 100).toFixed(0)} % of the time, under ${(PASS * 100).toFixed(0)} %`); }
}
if (failed) process.exit(1);
console.log(process.env.STRICT ? 'the caves can be delved' : 'measured (STRICT=1 to hold the caves to it)');
