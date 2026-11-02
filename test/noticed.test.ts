import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { caveFor } from '../src/vgm/caves';
import { Noticed, noticeable } from '../src/game/noticed';
import { seesOver } from '../src/world/sight';
import type { Decision } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const n = classic.noticing!;

/** A flat land with a ridge across x = 100 (z-wide), `rise` metres high. */
const ridge = (rise: number) => (x: number, _z: number): number => (Math.abs(x - 100) < 20 ? rise : 0);

test('noticing (D66): a place behind a rise gets no mark until it is in line of sight within the range, by day; at night only close by', () => {
  const spot = { id: 'cave-1', x: 220, z: 0, what: 'cave' }, nt = new Noticed();
  // Behind a ridge 30 m high: not seen from the near side, though within range.
  assert.equal(nt.glance({ x: 90, y: 0, z: 0 }, [spot], ridge(30), 1, n).length, 0);
  assert.ok(!nt.noticedAlready('cave-1'));
  // Past the ridge, in sight but still too far (the range is 150 m).
  assert.equal(nt.glance({ x: 20, y: 0, z: 0 }, [spot], ridge(0), 1, n).length, 0);
  // Close enough with nothing between, by night: a fifth of the range.
  assert.equal(nt.glance({ x: 100, y: 0, z: 0 }, [spot], ridge(0), 0, n).length, 0, 'in the dark 120 m is too far');
  assert.equal(nt.glance({ x: 100, y: 0, z: 0 }, [spot], ridge(0), 1, n).length, 1, 'by day 120 m is noticed');
  assert.equal(nt.glance({ x: 100, y: 0, z: 0 }, [spot], ridge(0), 1, n).length, 0, 'noticed once');
  // Saved and restored.
  assert.deepEqual(new Noticed(nt.keep()).keep(), ['cave-1']);
  assert.ok(seesOver(ridge(0), 0, 1.7, 0, 100, 2.5, 0));
});

test('noticing (D66): hidden places are never listed (finds, wrecks on the sea bed, houses)', () => {
  const log = [
    { kind: 'dungeon', id: 'cave-1', template: 'cave', town: 't', building: 0, site: { x: 1, z: 2, yaw: 0 }, seed: 1, setPiece: 'a' },
    { kind: 'dungeon', id: 'cellar-1', template: 'cellar', town: 't', building: 3, seed: 1, setPiece: 'a' },
    { kind: 'sight', id: 'sight-1', sight: 'standing-stones', x: 3, z: 4, yaw: 0, seed: 1, at: 0 },
    { kind: 'sight', id: 'sight-2', sight: 'buried-chest', need: 'reward', x: 5, z: 6, yaw: 0, seed: 1, at: 0 },
    { kind: 'sight', id: 'sight-3', sight: 'wreck', sea: true, x: 7, z: 8, yaw: 0, seed: 1, at: 0 },
  ] as unknown as Decision[];
  assert.deepEqual(noticeable(log).map((s) => [s.id, s.what]), [['cave-1', 'cave'], ['sight-1', 'standing stones']]);
});

test('noticing (D66, K9): the cave tool puts a cave ahead of a walking hero, in view, its mouth turned to them, and walking on the hero notices it before they are on it', () => {
  const seed = parseSeed('masterworld'), { terrain, log, home } = startWorld(), t = terrain.towns[0].decision, height = (x: number, z: number) => terrain.height(x, z);
  const open = log.filter((d) => !(d.kind === 'dungeon' && d.template === 'cave'));
  // Three places on the land where the tool finds a cave ahead (found by scanning the headings out of the town).
  for (const [k, d] of [[3, 430], [7, 390], [8, 1050]]) {
    const a = (k * Math.PI) / 8, hero = { x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d }, toward = { x: hero.x + Math.cos(a) * 400, z: hero.z + Math.sin(a) * 400 };
    const cave = caveFor({ seed, log: open, terrain, towns: terrain.towns, hours: 30, setting: classic, home, hero, toward });
    assert.ok(cave?.site, `heading ${k}: a cave is opened`);
    const s = cave.site, dx = s.x - hero.x, dz = s.z - hero.z, away = Math.hypot(dx, dz);
    assert.ok(away >= n.ahead[0] * 0.8 && away <= n.ahead[1] + 160, `${away.toFixed(0)} m ahead`);
    assert.ok(Math.abs(Math.atan2(dz, dx) - a) <= n.spread + 0.5, 'within the spread of the hero\'s way (the mouth is moved to its cliff\'s foot)');
    assert.ok((-dx * -Math.sin(s.yaw) + -dz * -Math.cos(s.yaw)) / away < -0.2, 'the mouth faces the hero');
    assert.ok(seesOver(height, hero.x, height(hero.x, hero.z) + n.eye, hero.z, s.x, height(s.x, s.z) + n.face, s.z), 'in view of the hero');
    // The hero walks on (the bot's straight way): the cave is marked before they are within 20 m of it, and from the mark alone they find it.
    const nt = new Noticed(), spots = noticeable([...open, cave]), ux = dx / away, uz = dz / away;
    let marked = -1;
    for (let m = 0; m <= away - 10; m += 4) {
      const p = { x: hero.x + ux * m, z: hero.z + uz * m };
      nt.glance({ x: p.x, y: height(p.x, p.z), z: p.z }, spots, height, 1, n);
      if (nt.noticedAlready(cave.id)) { marked = away - m; break; }
    }
    assert.ok(marked >= 20, `heading ${k}: marked ${marked.toFixed(0)} m before the mouth`);
  }
});
