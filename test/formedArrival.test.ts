import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caves, small } from './support/formedCave';
import { formCave } from '../src/world/cave/form';
import { Walker } from '../src/game/walker';
import { formedWorld } from '../src/game/formedWorld';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';

/** Where a hero arriving through the portal stands: the plane's floor. It must be a floor (not air over a pit) and the arch must be walled and floored. */
function arrive(seed: number, rock: string): { settled: number; sole: boolean; walls: boolean } {
  const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), t = c.skeleton.throat!, f = c.field as BrickField;
  const w = new Walker(formedWorld(f));
  w.place(t.x, t.z, t.y + 0.02);
  for (let i = 0; i < 120; i++) w.step({ forward: 0, strafe: 0, heading: t.yaw, walk: false, up: false, down: false }, 1 / 60);
  // Two metres in: rock under the floor and on both sides (the arch is a tunnel of its own).
  const sin = Math.sin(t.yaw), cos = Math.cos(t.yaw), at = (u: number, v: number, wd: number) => fieldAt(f, t.x + u * cos + wd * sin, t.y + v, t.z - u * sin + wd * cos, -1);
  return { settled: w.pos.y - t.y, sole: at(0, -0.8, -2) < 0, walls: at(2, 1, -2) < 0 && at(-2, 1, -2) < 0 };
}

test('formed arrival: the hero arrives at the throat on a floor, never over a pit (the plane is placed where the arch opens on level ground), in a tunnel with its own floor and walls', () => {
  // These caves had the plane over a pit of 18 to 20 m before.
  for (const [seed, rock] of [[1, 'massive'], [5, 'jointed']] as const) {
    const a = arrive(seed, rock);
    assert.ok(Math.abs(a.settled) < 0.3, `${rock} ${seed}: the hero settles ${a.settled.toFixed(1)} m from the plane's floor`);
    assert.ok(a.sole, `${rock} ${seed}: rock under the arch`);
    assert.ok(a.walls, `${rock} ${seed}: rock beside the arch`);
  }
});
