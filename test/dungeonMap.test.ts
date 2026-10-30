import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSeen, LANTERN_CELLS } from '../src/game/dungeonMap';
import { wallOf } from '../src/app/dungeonSheet';

const cellars: Cellar[] = Array.from({ length: 6 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));

test('dungeon map: a room stood in is known whole, the rest stays dark until walked near', () => {
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout), seen = new DungeonSeen(s), { cell, storey } = c.layout.scale;
    const r = c.layout.rooms[c.graph.entrance];
    seen.see((r.x + 0.5) * cell, r.level * storey, (r.z + 0.5) * cell);
    for (let j = r.z; j < r.z + r.d; j++) for (let i = r.x; i < r.x + r.w; i++) assert.ok(seen.has(i, j, r.level), 'every cell of the room');
    // A room far from the entrance is not seen yet.
    const far = c.layout.rooms.find((o) => Math.abs(o.x - r.x) + Math.abs(o.z - r.z) > r.w + r.d + 2 * LANTERN_CELLS + 4);
    if (far) assert.ok(!seen.has(far.x, far.z, far.level), 'a far room is dark');
    // Saved and laid over a fresh record: the same.
    const again = new DungeonSeen(s);
    again.restore(seen.save());
    assert.deepEqual(again.save().sort(), seen.save().sort());
  }
});

test('dungeon map: a hidden way is drawn as wall until found, a shut door as a bar', () => {
  let secrets = 0, shut = 0;
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout);
    for (const pl of c.layout.links) for (const door of pl.doors) {
      const kind = pl.link.kind, edge = wallOf({ space: s }, door.x, door.z, door.level, door.dir);
      if (kind === 'open' || kind === 'drop') { assert.equal(edge, 'open'); continue; }
      if (kind === 'locked' && edge !== 'open') { shut++; assert.equal(edge, 'shut'); }
      if (kind !== 'secret') continue;
      // The secret end is the feature end (the room's side when there is a passage).
      const was = edge;
      s.open.add(pl.link.id);
      const now = wallOf({ space: s }, door.x, door.z, door.level, door.dir);
      if (was === 'wall') { secrets++; assert.equal(now, 'open', 'found: open'); }
      s.open.delete(pl.link.id);
    }
  }
  assert.ok(secrets > 0, 'some secret ways among the test cellars');
  assert.ok(shut > 0, 'some locked doors among the test cellars');
});
