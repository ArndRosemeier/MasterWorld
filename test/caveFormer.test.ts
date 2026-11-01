import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { validateCaves, validateSetting, type CavesDef } from '../src/setting/contract';
import { bedAt, jointDistance, oreAt, rockBlock } from '../src/world/cave/block';
import { rockById, rockFor, sharesFor, sizeFor } from '../src/world/cave/choose';
import { fieldAt } from '../src/world/dungeon/rockMesh';
import { formCave } from '../src/world/cave/form';
import { previewLand } from '../src/world/cave/land';
import { formSolution } from '../src/world/cave/solution';

const caves = classic.caves!;
// The tests form on a block a little smaller than the smallest cave, to keep within the time of `npm test`.
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 60, deep: 28, field: 0.6 };
const blockOf = (seed: number, rock: string, size = small) => rockBlock(seed, rockById(caves, rock), size, previewLand(seed, size.across, size.deep), caves.ore, size.step);

test('caves: the setting\'s cave data is valid, and bad data is told', () => {
  assert.deepEqual(validateSetting(classic), []);
  const kinds = classic.world.kinds!.map((k) => k.id);
  assert.deepEqual(validateCaves(caves, kinds, 't'), []);
  const bad: CavesDef = { ...caves, way: { ...caves.way, minHeight: 1.6 }, geology: [{ kind: 'nowhere', rocks: { granite: 1 } }] };
  const told = validateCaves(bad, kinds, 't').join('\n');
  assert.match(told, /fit the standing hero/);
  assert.match(told, /land kind "nowhere"/);
  assert.match(told, /rock "granite"/);
});

test('caves: the big cave is about 300 m across and 60 m deep, every size a constant', () => {
  const big = caves.sizes.find((s) => s.id === 'big')!;
  assert.deepEqual([big.across, big.deep], [300, 60]);
});

test('caves: the rock block is seeded and pure', () => {
  for (const rock of caves.rocks) {
    const a = blockOf(7, rock.id), b = blockOf(7, rock.id), c = blockOf(8, rock.id);
    assert.equal(JSON.stringify(a.water), JSON.stringify(b.water));
    assert.deepEqual(Array.from(a.beds.edges), Array.from(b.beds.edges));
    assert.deepEqual(a.faults, b.faults);
    assert.notDeepEqual(Array.from(a.beds.edges), Array.from(c.beds.edges), 'another seed, another rock');
    // Beds climb, joints are in sets, the levels are the water table dropping, sinks stand high over the newest.
    assert.ok(a.beds.edges.every((e, i) => i === 0 || e > a.beds.edges[i - 1]));
    assert.equal(a.joints.length, rock.joints.sets);
    const tables = a.water.stages.map((s) => s.table);
    assert.ok(tables.every((t, i) => i === 0 || t < tables[i - 1]), 'oldest level highest');
    assert.ok(a.water.sinks.length >= 1 && a.water.sinks.every((s) => s.y > tables[0]), 'water comes in above the oldest table');
    assert.ok(a.water.stages.every((s) => s.springs.length >= rock.water.springs[0]));
    // Queries answer inside the block.
    const j = a.joints[0], u = j.planes[3];
    assert.ok(jointDistance(j, j.nx * u, j.nz * u) < 1e-9, 'on a crack the distance is nothing');
    assert.ok(bedAt(a.beds, 10, 10, 10) >= 0 && oreAt(a, 1, 1, 1) >= 0);
  }
  // Ore bodies are in the rock somewhere (for show: no mining).
  const b = blockOf(3, 'massive');
  assert.ok(b.ore.length >= caves.ore.bodies[0] && b.ore.length <= caves.ore.bodies[1]);
});

test('caves: the land\'s kind holds the rock, and the shares are mostly pure', () => {
  assert.equal(rockFor(caves, 'moor', 1), null, 'moor holds no solution cave');
  assert.ok(rockFor(caves, 'karst', 1), 'karst does');
  const seen = new Set<string>();
  let pure = 0, lava = 0;
  const N = 600;
  for (let s = 0; s < N; s++) {
    seen.add(rockFor(caves, 'karst', s)!.id);
    const sh = sharesFor(caves, 'karst', s), vals = [sh.built, sh.water, sh.lava];
    assert.ok(Math.abs(vals.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    if (vals.filter((v) => v > 0).length === 1) pure++;
    lava += sh.lava;
    assert.ok(vals.filter((v) => v > 0).length <= 2, 'karst allows two shares at most (no lava there)');
  }
  assert.deepEqual([...seen].sort(), ['jointed', 'massive', 'thin-bedded']);
  assert.equal(lava, 0, 'no lava on karst');
  assert.ok(pure / N > 0.5 && pure / N < 0.8, `pure caves are the norm (${pure / N})`);
  // A volcanic land allows lava, and a size is always drawn from the setting's.
  let withLava = 0;
  for (let s = 0; s < 200; s++) if (sharesFor(caves, 'volcanic', s).lava > 0) withLava++;
  assert.ok(withLava > 40);
  assert.ok(caves.sizes.includes(sizeFor(caves, 5)));
});

const loopsOf = new Map<string, number>();
for (const rock of ['massive', 'jointed', 'thin-bedded']) {
  test(`caves: a ${rock} cave forms the same twice, reaches its springs, and no way squeezes`, () => {
    const carved = rock === 'thin-bedded', a = carved ? formCave(caves, 11, rock, small.id, undefined, undefined, small) : { skeleton: formSolution(blockOf(11, rock), caves, small.scale, small.step), block: blockOf(11, rock), field: null }, again = formSolution(blockOf(11, rock), caves, small.scale, small.step), sk = a.skeleton, way = caves.way;
    loopsOf.set(rock, sk.stats.loops);
    const bare = (k: typeof sk) => JSON.stringify({ ...k, stats: { ...k.stats, ms: 0 } });
    assert.equal(bare(sk), bare(again), 'seeded');
    assert.ok(sk.stats.length > 60, `the water opened some way (${sk.stats.length} m)`);
    assert.ok(sk.springs.length >= 1 && sk.sinks.length >= 1);
    assert.ok(sk.voids.length <= a.block.rock.collapse.most);
    assert.ok(sk.conduits.some((c) => c.kind === 'mouth') && sk.conduits.some((c) => c.kind === 'shaft'), 'ways in at the sinks, a mouth at a spring');
    // The skeleton's ways are at least the standing hero's size.
    for (const c of sk.conduits) for (const p of c.points) {
      assert.ok(2 * p.A >= way.minWidth && 2 * p.B + p.D >= way.minHeight, `a way of ${2 * p.A} x ${2 * p.B + p.D} m squeezes`);
      assert.ok(Number.isFinite(p.x + p.y + p.z));
    }
    // And so is the carved rock (carved for the braided cave, the hardest, to spare the test time): the air column over the way's middle holds the hero's height, wall scallops and all.
    let checked = 0;
    for (const c of sk.conduits) {
      if (c.kind !== 'passage' || !a.field) continue;
      for (let i = 2; i < c.points.length - 2; i += 3) {
        const p = c.points[i];
        // Skip where another passage or a void crosses (it only makes more room).
        const base = p.y - p.B - p.D;
        let run = 0;
        for (let y = base - 0.2; y < p.y + p.B + 2; y += 0.1) { if (fieldAt(a.field, p.x, y, p.z) > 0) run += 0.1; else if (run > 0) break; }
        assert.ok(run >= way.minHeight - 0.45, `air column ${run.toFixed(2)} m at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)})`);
        checked++;
      }
    }
    if (a.field) assert.ok(checked > 10);
  });
}

test('caves: the three rock settings leave three patterns', () => {
  // Seed 11 was formed above; one more seed each.
  const loops = (rock: string) => (loopsOf.get(rock) ?? formSolution(blockOf(11, rock), caves, small.scale, small.step).stats.loops) + formSolution(blockOf(12, rock), caves, small.scale, small.step).stats.loops;
  const branch = loops('massive'), maze = loops('jointed'), braids = loops('thin-bedded');
  assert.ok(maze > branch && braids > branch, `a maze (${maze}) and braids (${braids}) have more loops than branchwork`);
});
