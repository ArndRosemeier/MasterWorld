import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { formedCave, caves } from './support/formedCave';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { inhabit } from '../src/vgm/inhabit';
import { lockSites } from '../src/world/cave/locks';
import { FormedSpace } from '../src/sim/formedSpace';
import { lockPiece } from '../src/world/cave/lockMesh';
import { cellarMeshes } from '../src/world/dungeon/cellarMesh';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';

test('cave locks (K6): a story\'s shut ways stand where the cave narrows and no way goes round, apart from each other and from the way in', () => {
  let locks = 0, links = 0;
  for (const [rock, seed] of [['massive', 6], ['jointed', 5]] as const) {
    const { c, reading: rd } = formedCave(seed, rock), field = c.field as BrickField, way = caves.way;
    for (let n = 1; n <= 8; n++) {
      const cellar = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
      const h = inhabit(cellar, field, rd, c.skeleton.throat), found = lockSites(h.cellar, field, rd, h.cells, way);
      links += cellar.graph.links.filter((l) => l.kind === 'oneway' || l.kind === 'locked' || l.kind === 'secret').length;
      locks += found.length;
      assert.deepEqual(found, lockSites(h.cellar, field, rd, h.cells, way), 'seeded');
      for (const k of found) {
        assert.ok(k.width <= way.lock.widest && k.width >= way.minWidth - 0.6, `${rock} ${seed}/${n}: ${k.width.toFixed(1)} m across`);
        assert.ok(k.height >= way.lock.tall, `${k.height.toFixed(1)} m high`);
        assert.ok(Math.abs(Math.hypot(k.tx, k.tz) - 1) < 1e-6, 'a unit way through');
        assert.ok(fieldAt(field, k.x, k.y + 1.1, k.z, -1) > 0, 'in air');
        assert.ok(k.cells.length >= 1);
        // It cuts: the near side's home reaches the far side's only through it.
        const shut = new Set(k.cells), seen = new Set<number>([h.cells[k.a]]), q = [h.cells[k.a]];
        for (let i = 0; i < q.length; i++) for (let e = rd.edgeStart[q[i]]; e < rd.edgeStart[q[i] + 1]; e++) { const d = rd.edgeTo[e]; if (!seen.has(d) && !shut.has(d)) { seen.add(d); q.push(d); } }
        assert.ok(!seen.has(h.cells[k.b]), `${rock} ${seed}/${n}: link ${k.link} is the only way to room ${k.b}`);
        assert.ok(rd.depth[h.cells[k.a]] < Infinity);
        for (const o of found) if (o !== k) assert.ok(Math.hypot(o.x - k.x, o.z - k.z) + Math.abs(o.y - k.y) >= way.lock.apart - 1e-6, 'locks apart');
      }
    }
  }
  assert.ok(locks >= 6, `${locks} of ${links} shut ways found a place`);
});

test('cave locks (K6): a shut lock is solid and keeps the creatures back; a boulder is levered out from its near side, a grate opens with its key, stacked stones are found by lingering', () => {
  const { c, reading: rd } = formedCave(6, 'massive'), field = c.field as BrickField, way = caves.way;
  let done = 0;
  const frees: number[] = [];
  for (let n = 1; n <= 8 && done < 2; n++) {
    const cellar = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
    const h = inhabit(cellar, field, rd, c.skeleton.throat), found = lockSites(h.cellar, field, rd, h.cells, way);
    const l = found.find((k) => k.kind === 'oneway');
    if (!l) continue;
    done++;
    const homes = h.cellar.formed!.homes, side = (k: number) => ({ x: l.x - l.tx * k, z: l.z - l.tz * k });
    const near = side(0.9), far = side(-0.9);
    const open = (lock: typeof l) => new FormedSpace(h.cellar.layout, field, h.ground, homes, undefined, [lock]);
    // Shut: solid in its way, free beside; creatures cannot be walked through it.
    const spot = (k: number) => { const x = l.x - l.tx * k, z = l.z - l.tz * k; return { x, y: h.ground.floorAt(x, z, l.y + 0.6) ?? l.y, z }; };
    const a = spot(3), b = spot(-3), free = h.ground.way(a, b).length;
    frees.push(free);
    const space = open(l);
    assert.ok(space.sdf(l.x, l.y + 1, l.z) < 0, 'solid in its way');
    assert.equal(h.ground.way(a, b).length, 0, `no way for a creature through a shut lock (${free} points without it)`);
    // From the far side the boulder holds; from the near side it is levered out.
    assert.deepEqual(space.touch(far.x, l.y, far.z, 0.1), []);
    assert.ok(space.sdf(l.x, l.y + 1, l.z) < 0);
    const ev = space.touch(near.x, l.y, near.z, 0.1);
    assert.deepEqual(ev, [{ kind: 'unbarred', link: l.link }]);
    assert.ok(space.sdf(l.x, l.y + 1, l.z) > 0, 'open: the way is clear');
    assert.equal(h.ground.way(a, b).length > 0, free > 0, 'and the creatures go through');
    // A saved visit opens it again.
    const again = open(l);
    again.openLink(l.link);
    assert.ok(again.sdf(l.x, l.y + 1, l.z) > 0);
    // A grate wants its key, picked up at the key room's home.
    const grate = open({ ...l, kind: 'locked', key: l.a });
    assert.deepEqual(grate.touch(near.x, l.y, near.z, 0.1), [], 'no key, no opening');
    const k = grate.keyAt(l.a);
    assert.deepEqual(grate.touch(k[0], k[1], k[2], 0.1), [{ kind: 'key', link: l.link }]);
    assert.deepEqual(grate.touch(near.x, l.y, near.z, 0.1), [{ kind: 'unlocked', link: l.link }]);
    // Stacked stones are found by lingering at them.
    const stones = open({ ...l, kind: 'secret' });
    assert.deepEqual(stones.touch(near.x, l.y, near.z, 1), []);
    assert.deepEqual(stones.touch(near.x, l.y, near.z, 1), [{ kind: 'found', link: l.link }]);
  }
  assert.equal(done, 2, 'two caves with a boulder lock');
  assert.ok(frees.some((f) => f > 0), `a creature's way past the lock without it (${frees.join(', ')})`);
});

test('cave locks (K6): each kind is drawn as a piece of its own at its lock, and a formed cave draws none of the story layout\'s doors or keys', () => {
  const { c, reading: rd } = formedCave(6, 'massive'), field = c.field as BrickField;
  let kinds = new Set<string>();
  for (let n = 1; n <= 6; n++) {
    const cellar = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
    const h = inhabit(cellar, field, rd, c.skeleton.throat), found = lockSites(h.cellar, field, rd, h.cells, caves.way);
    const ms = cellarMeshes(h.cellar);
    assert.equal(ms.doors.length, 0, 'no story doors in a formed cave');
    assert.equal(ms.keys.length, 0, 'no story keys');
    for (const l of found) for (const kind of ['oneway', 'locked', 'secret'] as const) {
      const p = lockPiece({ ...l, kind }, 7);
      kinds.add(p.kind);
      assert.equal(p.link, l.link);
      assert.ok(p.mesh.position.length >= 9 * 3, `${kind}: a mesh`);
      for (let i = 0; i < p.mesh.position.length; i += 3) {
        assert.ok(Math.hypot(p.mesh.position[i] - l.x, p.mesh.position[i + 2] - l.z) <= l.width / 2 + 4, `${kind}: close to its lock`);
        assert.ok(p.mesh.position[i + 1] >= l.y - 0.8 && p.mesh.position[i + 1] <= l.y + l.height + 1.5, `${kind}: within its height`);
      }
      assert.equal(p.opens, kind === 'locked' ? 'swing' : 'push');
      assert.equal(!!p.hinge, kind === 'locked');
    }
  }
  assert.equal(kinds.size, 3);
});
