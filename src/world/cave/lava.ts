/**
 * The lava former (D63, phase K7; docs/design/caves.md 3.2; pure, runs in a worker): a flow of lava ran from a vent down
 * the old land, its crust set over it, and it drained out from under it, leaving a tube. The land's own heights guide it:
 * from a vent on the high ground the course goes by steepest descent with meanders, the tube a few metres under the crust.
 * Its floor falls gently (a tube is nearly level, unlike water's canyons), so it runs on into the hillside and comes out
 * where the land has come down to its roof: that is the way in from the land (a mouth). Where the roof is thin it fell
 * in: a skylight, a way in and a shaft of daylight. A few side tubes (distributaries) leave the main one. It writes the
 * same skeleton the solution former does (world/cave/skeleton.ts), so the carver, dresser, reader and the game take it as it is.
 */
import { Noise, Rng, deriveSeed, lerp } from '@futuremagic/core';
import type { CavesDef } from '../../setting/contract';
import type { RockBlock } from './block';
import type { CondPoint, Conduit, Skeleton, Void } from './skeleton';

/** Metres between a tube's points. */
const STEP = 3;
/** Metres of rock kept between a tube and the block's sides and bottom. */
const EDGE = 8, BOTTOM = 3;
/** The way a tube's mouth runs on outwards (metres, as the solution caves' mouths do). */
const OUT = [0, 4, 8] as const;

/** One tube traced from a start: its points (section per point) and whether it came out into the day. */
interface Tube {
  readonly points: CondPoint[];
  readonly yaw: number[];
  readonly mouth: boolean;
}

/** Form the lava tubes of a block. `scale` sizes everything of the cave (the size's scale, 1 for a medium one). */
export function formLava(block: RockBlock, caves: CavesDef, scale: number, since: () => number): Skeleton {
  const t0 = since(), made = block.rock.lava;
  if (!made) throw new Error(`rock "${block.rock.id}" has no lava`);
  const lava = made;
  const rng = new Rng(deriveSeed(block.seed, 'cave', 'lava')), noise = new Noise(deriveSeed(block.seed, 'cave', 'lava', 'course'));
  const way = caves.way, Amin = way.minWidth / 2 + 0.1, Bmin = way.minHeight / 2 + 0.1;
  const land = block.land, top = block.deep - 2, across = block.across;
  // (The land's lie over a stretch of 18 m, not its bumps: a flow goes the way the whole slope runs.)
  const slope = (x: number, z: number): [number, number] => [(land.surface(x + 18, z) - land.surface(x - 18, z)) / 36, (land.surface(x, z + 18) - land.surface(x, z - 18)) / 36];

  /**
   * Trace a tube from (x, z) heading `yaw` with the floor at `floor`: on downhill (turning toward it, wandering), the floor
   * falling by `gradient` a metre, until the roof reaches the land (a mouth), a side of the block, or `most` metres.
   */
  function trace(x: number, z: number, yaw: number, floor: number, a0: number, b0: number, gradient: number, most: number, tag: number, minRun = 0, skew = 0): Tube {
    const points: CondPoint[] = [], yaws: number[] = [];
    let mouth = false, run = 0;
    for (let n = 0; run <= most; n++, run += STEP) {
      // The size swells and pinches along the way.
      const m = noise.n3(x / 14 + tag * 31, 0.5, z / 14), k = noise.n3(x / 11, 3.1 + tag, z / 11);
      const A = Math.max(Amin, a0 * (1 + 0.28 * m)), B = Math.max(Bmin, b0 * (1 + 0.22 * k));
      const ground = land.surface(x, z), roofTop = floor + 2 * B;
      // The roof has reached the land (before the tube has run its length it turns along the slope instead and sinks as
      // fast as it may, to stay under the crust): at last the tube comes out here.
      let along = false;
      if (n > 3 && roofTop > ground - 1) {
        const over = roofTop - (ground - lava.roof);
        if (run >= minRun || over > 4) { mouth = true; break; }
        floor -= Math.min(over, 0.3 * STEP);
        along = true;
      }
      if (floor + 2 * B > top) { floor = top - 2 * B; }
      // A course that comes back on itself ends (a tube never crosses its own past).
      if (points.some((q, i) => i < points.length - 6 && Math.hypot(q.x - x, q.z - z) < q.A + A + 2 && Math.abs(q.y - (floor + B)) < q.B + B)) break;
      // (The floor is flat: a slot as wide as the tube squares its bottom off, as a drained tube's lava floor lay level.)
      points.push({ x, y: floor + B, z, A, B, C: A * 0.8, D: 0, flow: 0 });
      yaws.push(yaw);
      // On: toward the downhill side, with a wander.
      const [gx, gz] = slope(x, z), g = Math.hypot(gx, gz);
      if (g > 1e-3) {
        // (A flow runs downhill, but a tube often runs on aslant across the slope: `skew`.)
        const want = Math.atan2(-gz, -gx) + skew;
        let d = want - yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        // Along the slope's contour (the way it was already heading) when the roof is near the land.
        if (along) {
          const tangent = Math.atan2(gx, -gz), tt = Math.cos(tangent - yaw) >= 0 ? tangent : tangent + Math.PI;
          let e = tt - yaw;
          while (e > Math.PI) e -= 2 * Math.PI;
          while (e < -Math.PI) e += 2 * Math.PI;
          d = e;
        }
        yaw += d * (along ? 0.6 : 0.35);
      }
      yaw += noise.n3(x / 30 + 9, tag * 7.7, z / 30) * lava.wander * 0.2;
      x += Math.cos(yaw) * STEP; z += Math.sin(yaw) * STEP;
      floor -= gradient * STEP;
      if (x < EDGE || z < EDGE || x > across - EDGE || z > across - EDGE || floor < BOTTOM) break;
    }
    return { points, yaw: yaws, mouth };
  }

  // The vent: of a dozen spots on the high ground, the one whose flow ran longest (a long tube is the norm; a flow that
  // met the valley side at once is a short one).
  const conduits: Conduit[] = [], voids: Void[] = [];
  let length = 0, junctions = 0, points = 0;
  const addTube = (t: Tube, level: number, way = false): void => {
    if (t.points.length < 3) return;
    conduits.push({ kind: 'passage', points: t.points, level, active: false });
    points += t.points.length;
    for (let i = 1; i < t.points.length; i++) length += Math.hypot(t.points[i].x - t.points[i - 1].x, t.points[i].z - t.points[i - 1].z, t.points[i].y - t.points[i - 1].y);
    // Its mouth: on out along the way it was heading, level, as a solution cave's spring mouth does.
    if (t.mouth || way) {
      const p = t.points[t.points.length - 1], yaw = t.yaw[t.yaw.length - 1];
      const out = (d: number): CondPoint => ({ ...p, x: p.x + Math.cos(yaw) * d, z: p.z + Math.sin(yaw) * d });
      conduits.push({ kind: 'mouth', points: OUT.map(out), level, active: false });
      length += OUT[OUT.length - 1];
    }
  };

  let main: Tube | null = null;
  for (let i = 0; i < 12; i++) {
    const x = rng.range(0.15, 0.85) * across, z = rng.range(0.15, 0.85) * across;
    const wide = rng.range(0, 1), a0 = lerp(lava.halfWidth[0], lava.halfWidth[1], wide) * Math.sqrt(scale), b0 = lerp(lava.halfHeight[0], lava.halfHeight[1], rng.range(0.2, 1)) * Math.sqrt(scale);
    const [gx, gz] = slope(x, z), yaw = Math.abs(gx) + Math.abs(gz) > 1e-3 ? Math.atan2(-gz, -gx) : rng.range(0, Math.PI * 2);
    // The floor starts as high as the block allows and the roof lets (a roof of rock under the land).
    const floor = Math.min(land.surface(x, z) - lava.roof, top) - 2 * b0;
    const tube = trace(x, z, yaw, floor, a0, b0, rng.range(lava.gradient[0], lava.gradient[1]), across * 1.6, i, rng.range(lava.length[0], lava.length[1]) * across, (rng.chance(0.5) ? 1 : -1) * rng.range(0.6, 1.2));
    // A flow that came out into the day counts for more than one that stopped in the rock: it is the way in.
    if (!main || (tube.mouth ? 25 : 0) + tube.points.length > (main.mouth ? 25 : 0) + main.points.length) main = tube;
  }
  const mains: Tube[] = main && main.points.length >= 3 ? [main] : [];
  // (A cave must have its way in: a flow that stopped in the rock gets its mouth at its end.)
  if (main) addTube(main, 0, true);

  // Side tubes off the main ones: a branch leaves at an angle, smaller, and runs its own way down.
  for (const [i, main] of mains.entries()) {
    const nb = rng.int(lava.branches[0], lava.branches[1]);
    for (let k = 0; k < nb && main.points.length > 8; k++) {
      const at = rng.int(Math.floor(main.points.length * 0.2), Math.floor(main.points.length * 0.8)), p = main.points[at];
      const yaw = main.yaw[at] + (rng.chance(0.5) ? 1 : -1) * rng.range(0.5, 1.1), small = rng.range(0.55, 0.8);
      const a0 = Math.max(Amin + 0.2, p.A * small), b0 = Math.max(Bmin + 0.2, p.B * small);
      const tube = trace(p.x + Math.cos(yaw) * STEP * 2, p.z + Math.sin(yaw) * STEP * 2, yaw, p.y - p.B - 0.3, a0, b0, rng.range(lava.gradient[0], lava.gradient[1]), rng.range(lava.branchLength[0], lava.branchLength[1]) * scale, 10 + i * 5 + k);
      if (tube.points.length >= 4) { addTube(tube, 0); junctions++; }
    }
  }

  // Skylights and fallen roofs: where a tube's roof is thin it fell in. Spaced apart; a skylight only where the land is inside the block.
  const cs: { x: number; z: number; floor: number; A: number; B: number; yaw: number; thin: number }[] = [];
  for (const c of conduits) if (c.kind === 'passage') c.points.forEach((p, i) => {
    const roof = land.surface(p.x, p.z) - (p.y + p.B);
    if (i > 2 && i < c.points.length - 1 && roof < lava.skylights.thin) cs.push({ x: p.x, z: p.z, floor: p.y - p.B, A: p.A, B: p.B, yaw: Math.atan2(c.points[i + 1].z - p.z, c.points[i + 1].x - p.x), thin: roof });
  });
  cs.sort((p, q) => p.thin - q.thin);
  const vrng = rng.fork('collapse');
  for (const c of cs) {
    if (voids.length >= lava.skylights.most) break;
    if (voids.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < lava.skylights.apart * scale) || !vrng.chance(0.8)) continue;
    const ground = land.surface(c.x, c.z), skylight = ground <= block.deep + 2;
    let height = vrng.range(5, 9) * Math.sqrt(scale);
    if (skylight) height = Math.max(5, ground - c.floor + 2); else height = Math.min(height, block.deep - c.floor - 3);
    if (height < 5) continue;
    const rx = Math.min(c.A * vrng.range(1.5, 2.2) + 3, 12 * Math.sqrt(scale)), rz = rx * vrng.range(0.6, 0.9);
    voids.push({ x: c.x, z: c.z, floor: c.floor, rx, rz, yaw: c.yaw, height, heapR: 0.5 * Math.min(rx, rz), heapH: Math.min(0.12 * height, 1), skylight, seed: deriveSeed(block.seed, 'void', voids.length) });
  }

  return {
    conduits, voids, sinks: [], springs: [], tables: [0],
    stats: { nodes: points, runs: conduits.length, length, junctions, loops: 0, ms: { prep: 0, flow: 0, chains: since() - t0 } },
  };
}
