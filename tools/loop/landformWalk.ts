/**
 * The walk trace of gate L: "a landform at least every minute of walking". Walks out of the start town in eight
 * directions (3 km each) and through each kind of country (four ways, 2 km each, from its nearest stretch), on
 * foot at the hero's run (game/walker.ts), and notes each landform passed: a landform whose ground the hero
 * walks over or beside (within its reach, or a boulder field's half width, and 40 m more), a mesa's wall
 * within 60 m of its foot, or a crag (ground steep enough to show its rock) within 40 m. Water and a town's ground are not walking out on the land: no time passes there.
 * Prints each walk's longest stretch without a landform, in minutes, and exits 1 if one is over a minute.
 * `node --import tsx tools/loop/landformWalk.ts [seed]`; `npm run walk:landforms` runs three worlds (CI). Some 5-10 s each.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { firstDecisions, startPlace } from '../../src/vgm/builder';
import { Terrain } from '../../src/world/terrain';
import { TownGround } from '../../src/world/town';
import { WALK } from '../../src/game/walker';

const name = process.argv[2] ?? 'masterworld';
const started = performance.now();
const terrain = new Terrain(parseSeed(name), classic);
const first = firstDecisions(terrain, startPlace(terrain));
terrain.settle(first);
const town = first.find((d) => d.kind === 'town');
if (!town) throw new Error('no start town');
const sk = terrain.skeleton, STEP = 10, PACE = WALK.run;

/** The slope (rise per metre) at which the ground shows its rock: a crag. */
const CRAG = 0.7;
const slopeAt = (x: number, z: number): number => {
  const h = terrain.height(x, z);
  return Math.hypot(terrain.height(x + 3, z) - h, terrain.height(x, z + 3) - h) / 3;
};

/** The longest stretch (minutes) without a landform on a straight walk from (x, z) towards (dx, dz), and how many it passed. */
function walk(x0: number, z0: number, dx: number, dz: number, km: number): { gap: number; forms: number; minutes: number; at: [number, number] } {
  const seen = new Set<object>();
  let since = 0, gap = 0, walked = 0, at: [number, number] = [x0, z0];
  for (let s = 0; s <= km * 1000; s += STEP) {
    const x = x0 + dx * s, z = z0 + dz * s, h = terrain.height(x, z);
    if (terrain.waterDepth(x, z, h) > 0.4 || terrain.townGround(x, z) !== TownGround.None) { since = 0; continue; }
    since += STEP / PACE; walked += STEP / PACE;
    let near = false;
    for (const f of terrain.landforms.within(x, z, 600)) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d <= Math.max(f.reach, f.L) + 40) { near = true; seen.add(f); }
    }
    sk.mesaRise(x, z);
    if (sk.lastMesa.tall > 15 && Math.abs(sk.lastMesa.u) < 60) near = true;
    // A crag: ground steep enough to show its rock (some 35 degrees) here or 40 m to either side.
    for (const side of [-40, 0, 40]) if (!near && slopeAt(x - dz * side, z + dx * side) > CRAG) near = true;
    if (near) since = 0;
    if (since > gap) { gap = since; at = [x, z]; }
  }
  return { gap: gap / 60, forms: seen.size, minutes: walked / 60, at };
}

const walks: { what: string; x: number; z: number; dx: number; dz: number; km: number }[] = [];
for (let a = 0; a < 8; a++) walks.push({ what: `start, ${a * 45}°`, x: town.x, z: town.z, dx: Math.cos((a * Math.PI) / 4), dz: Math.sin((a * Math.PI) / 4), km: 3 });
for (const k of sk.kinds) {
  const at = sk.nearestKind(k.id, town.x, town.z);
  if (!at) { console.log(`${k.id}: none found`); continue; }
  for (let a = 0; a < 4; a++) walks.push({ what: `${k.id}, ${a * 90}°`, x: at.x, z: at.z, dx: Math.cos((a * Math.PI) / 2), dz: Math.sin((a * Math.PI) / 2), km: 2 });
}

let worst = 0, failed = 0;
for (const w of walks) {
  const r = walk(w.x, w.z, w.dx, w.dz, w.km);
  worst = Math.max(worst, r.gap);
  const bad = r.gap > 1;
  if (bad) failed++;
  console.log(`${bad ? 'LONG ' : '     '}${w.what.padEnd(16)} ${r.minutes.toFixed(1).padStart(4)} min walked, ${String(r.forms).padStart(3)} landforms, longest without ${r.gap.toFixed(2)} min${bad ? `, ending at (${r.at[0].toFixed(0)}, ${r.at[1].toFixed(0)})` : ''}`);
}
console.log(`${failed ? `${failed} of ${walks.length} walks had a stretch over a minute` : `all ${walks.length} walks pass`}: longest ${worst.toFixed(2)} min without a landform (${name}, ${((performance.now() - started) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
