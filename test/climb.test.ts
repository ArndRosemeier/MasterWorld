import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { Walker, type WalkIntent, type WalkWorld } from '../src/game/walker';
import { SMALL } from './small';
import { LandWalk } from '../src/game/evening';

const terrain = new Terrain(parseSeed('masterworld'), classic, SMALL);
const world: WalkWorld = {
  height: (x, z) => terrain.height(x, z),
  rockSurface: () => null,
  waterLevel: () => null,
  climbable: (x, z) => terrain.climbable(x, z),
};
const sk = terrain.skeleton;

/** A mesa wall's foot (where the wall starts to rise) along a line east, with holds on it or sheer. */
function wallFoot(holds: boolean): { x: number; z: number; nx: number; nz: number; tall: number } {
  for (let z = 36000; z < 39000; z += 97) for (let x = -25000; x < -20000; x += 3) {
    sk.mesaRise(x, z);
    const m = sk.lastMesa;
    if (m.u < 0 || m.u > 3 || m.pass > 0 || m.tall < 45 || m.tall > 90 || (m.climb > 0.9) !== holds || (!holds && m.climb > 0)) continue;
    if (sk.mesaWeight(x, z) < 1) continue;
    // Holds (or none) up the whole face: the same straight up it.
    const { nx, nz, tall } = m;
    let same = true;
    for (let k = 1; k < 8 && same; k++) { sk.mesaRise(x + nx * k * 8, z + nz * k * 8); same = (sk.lastMesa.climb > 0.9) === holds && sk.lastMesa.pass === 0; }
    if (same) return { x: x - nx * 4, z: z - nz * 4, nx, nz, tall };
  }
  throw new Error('no wall foot found');
}

const go = (forward: number, heading: number, up = false): WalkIntent => ({ forward, strafe: 0, heading, walk: false, up, down: false });

test('climb: up a face with holds, hand over hand, and over its top with a pull-up', () => {
  const f = wallFoot(true), w = new Walker(world);
  w.place(f.x, f.z);
  const heading = Math.atan2(-f.nx, -f.nz), foot = w.pos.y;
  let t = 0, climbed = false, pulled = false;
  for (; t < 300 && !(pulled && w.mode === 'ground'); t += 0.05) {
    w.step(go(1, heading), 0.05);
    climbed ||= w.mode === 'climb';
    pulled ||= w.mode === 'pull';
  }
  assert.ok(climbed, 'got onto the face');
  assert.ok(pulled && w.mode === 'ground', `over the top (mode ${w.mode})`);
  assert.ok(w.pos.y - foot > f.tall * 0.25, `${(w.pos.y - foot).toFixed(0)} m up a wall of ${f.tall.toFixed(0)} m`);
  assert.ok(t > (w.pos.y - foot) / 1.2, `${t.toFixed(0)} s: climbed, not jumped`);
});

test('climb: a sheer face is not climbed, nor walked up slantwise', () => {
  const f = wallFoot(false), w = new Walker(world);
  w.place(f.x, f.z);
  const foot = w.pos.y, heading = Math.atan2(-f.nx, -f.nz);
  // Straight at it, then slantwise either way.
  for (const turn of [0, 0.9, -0.9]) for (let t = 0; t < 40; t += 0.05) w.step(go(1, heading + turn), 0.05);
  assert.notEqual(w.mode, 'climb');
  assert.ok(w.pos.y - foot < 12, `got ${(w.pos.y - foot).toFixed(1)} m up a sheer wall`);
});

test('climb: spent, the climber lets go and falls; the fall is measured', () => {
  const f = wallFoot(true), w = new Walker(world);
  w.place(f.x, f.z);
  const heading = Math.atan2(-f.nx, -f.nz);
  let strength = 30;
  w.tire = (dt, effort) => (strength -= dt * effort) > 0;
  let top = 0;
  for (let t = 0; t < 60 && w.mode !== 'air'; t += 0.05) { w.step(go(1, heading), 0.05); top = Math.max(top, w.pos.y); }
  assert.equal(w.mode, 'air', 'let go');
  for (let t = 0; t < 10 && w.mode === 'air'; t += 0.05) w.step(go(0, heading), 0.05);
  assert.ok(w.fell > 4, `fell ${w.fell.toFixed(1)} m`);
});

/** A pass's foot: where a ramp of fallen rock starts up a wall (the noise is read at the foot, so it runs straight up). */
function passFoot(): { x: number; z: number; nx: number; nz: number; tall: number } {
  for (let z = 36000; z < 40000; z += 61) for (let x = -25000; x < -19000; x += 3) {
    sk.mesaRise(x, z);
    const m = sk.lastMesa;
    if (m.u < 0 || m.u > 3 || m.pass < 0.9 || m.tall < 45 || sk.mesaWeight(x, z) < 1) continue;
    return { x, z, nx: m.nx, nz: m.nz, tall: m.tall };
  }
  throw new Error('no pass found');
}

/** The loop bot (game/evening.ts) from in front of a wall's foot to a point on top behind it. */
function botUp(f: { x: number; z: number; nx: number; nz: number; tall: number }, climb: boolean, inward: number) {
  const bot = new LandWalk(terrain, climb), w = bot.walker;
  w.place(f.x - f.nx * 25, f.z - f.nz * 25);
  const foot = w.pos.y, tx = f.x + f.nx * inward, tz = f.z + f.nz * inward;
  const r = bot.go(tx, tz);
  return { ...r, rose: w.pos.y - foot, climbed: bot.climbed, top: terrain.height(tx, tz) - foot };
}

test('climb: the loop bot reaches a plateau top once by a pass and once by climbing', () => {
  const pass = passFoot(), byPass = botUp(pass, false, pass.tall / 0.6 + 40);
  assert.ok(byPass.arrived, `up the pass: ${byPass.left.toFixed(0)} m short`);
  assert.equal(byPass.climbed, 0, 'walked up the pass');
  assert.ok(byPass.top > 30 && byPass.rose > byPass.top - 3, `rose ${byPass.rose.toFixed(0)} m to a top ${byPass.top.toFixed(0)} m up`);
  const face = wallFoot(true), byClimb = botUp(face, true, 60);
  assert.ok(byClimb.arrived, `up the face: ${byClimb.left.toFixed(0)} m short`);
  assert.ok(byClimb.climbed > face.tall * 0.25, `climbed ${byClimb.climbed.toFixed(0)} m of a wall of ${face.tall.toFixed(0)} m`);
  assert.ok(byClimb.top > 30 && byClimb.rose > byClimb.top - 3, `rose ${byClimb.rose.toFixed(0)} m to a top ${byClimb.top.toFixed(0)} m up`);
});
