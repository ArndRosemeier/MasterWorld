import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { caveFor, caveSpecFor, cliffCaveFor } from '../src/vgm/caves';
import { dungeonFor, loreOf, placeOf } from '../src/vgm/dungeons';
import { answerNeed } from '../src/vgm/toolbox';
import { siteInCliff } from '../src/world/dungeon/caveMouth';
import { isEmpty, outlineCellar, sketchCellar } from '../src/world/dungeon/cellar';
import { caveGlows, caveSeed, torchSpots } from '../src/world/dungeon/torches';
import { caveFeatures } from '../src/world/dungeon/caveFeatures';
import { startWorld } from './frontierLand';

test('cave tool: Discovery overdue near a cliff opens a cave in it, one at a time', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = startWorld();
  const town = terrain.towns[0], height = (x: number, z: number) => terrain.height(x, z);
  // The hero out on the land, walking a way that a cliff lies ahead of (found by scanning the headings out of the town; D66: the tool opens the cave ahead, in view).
  const t = town.decision, a = (3 * Math.PI) / 8, hero = { x: t.x + Math.cos(a) * 430, z: t.z + Math.sin(a) * 430 }, toward = { x: hero.x + Math.cos(a) * 400, z: hero.z + Math.sin(a) * 400 };
  const open = log.filter((d) => !(d.kind === 'dungeon' && d.template === 'cave'));
  const c = { seed, log: open, terrain, towns: terrain.towns, hours: 30, setting: classic, home, hero, toward };
  const d = caveFor(c);
  assert.ok(d?.site, 'a cave is opened');
  assert.equal(d.template, 'cave');
  assert.ok(siteInCliff(height, d.site), 'its mouth is in a cliff');
  assert.ok(Math.hypot(d.site.x - hero.x, d.site.z - hero.z) < 500, 'near the hero');
  assert.equal(caveFor({ ...c, toward: null }), null, 'no way known, no cave ahead');
  assert.equal(d.at, 30);
  assert.equal(caveFor({ ...c, log: [...open, d] }), null, 'not another while it is open near');
  const m = answerNeed('discovery', c);
  assert.equal(m?.tool, 'cave', 'Discovery asks the cave tool first');
  assert.match(m.reason, /cave in a cliff/);
});

test('caves: a share stand empty, sights with nobody in them; asked-for dwellers are always there', () => {
  const seed = parseSeed('masterworld');
  const { terrain, home } = startWorld();
  const town = terrain.towns[0], lore = loreOf(classic, 'cave');
  const base = dungeonFor({ purpose: 'lead', town, kinds: ['cave'] }, { seed, terrain, log: [], home, dungeons: classic.dungeons })!;
  const place = placeOf(base, terrain.towns, classic.dungeons)!;
  const caves = Array.from({ length: 60 }, (_, i) => ({ ...base, seed: base.seed + i * 7919 }));
  const empty = caves.filter((d) => isEmpty(sketchCellar(d, place, lore)));
  const share = empty.length / caves.length;
  assert.ok(share > 0.05 && share < 0.4, `about a fifth empty (${(share * 100).toFixed(0)} %)`);
  const c = outlineCellar(empty[0], place, lore);
  assert.equal(c.spawns.length, 0, 'nobody to fight in an empty cave');
  // No torches in a natural cave: daylight falls into its cavern through a crack high in the roof.
  const glows = caveGlows(c), floor = Math.min(...c.layout.rooms.map((r) => r.level)) * c.layout.scale.storey;
  assert.equal(torchSpots(c).length, 0);
  // Daylight through a crack high in each cavern's roof, and down each shaft onto the cavern's floor (P1).
  const shafts = caveFeatures(c.layout, caveSeed(c)).shafts;
  assert.ok(shafts.length >= 1, 'a shaft to the day in its highest cavern');
  assert.ok(glows.some((g) => g.y - floor > 15), `daylight high in the cavern (${glows.map((g) => g.y.toFixed(1)).join(', ')})`);
  for (const s of shafts) assert.ok(glows.some((g) => Math.hypot(g.x - s.x, g.z - s.z) < 0.1 && g.y > s.floor + 3 && g.y < s.roof), 'daylight down the shaft over its floor');
  assert.equal(c.dweller.id, lore.empty!.def.id);
  const asked = lore.dwellers[0].encounter;
  assert.ok(empty.every((d) => !isEmpty(sketchCellar({ ...d, dwellers: asked }, place, lore))), 'dwellers asked for move in');
});

test('cave tool (K6): the formed cave is asked for by the country at its mouth: its rock, a size the story needs, shares the land allows', () => {
  const caves = classic.caves!;
  // Moor and badlands hold mines (all built); karst holds one of its three rocks.
  for (const kind of ['moor', 'badlands']) {
    const m = caveSpecFor(caves, kind, { seed: 5 }, 6)!;
    assert.equal(m.rock, 'hard-rock');
    assert.deepEqual(m.shares, { built: 1, water: 0, lava: 0 });
  }
  const rocks = new Set<string>(), sizes = new Set<string>();
  for (let seed = 1; seed < 80; seed++) {
    const a = caveSpecFor(caves, 'karst', { seed, danger: 3 }, 6)!, again = caveSpecFor(caves, 'karst', { seed, danger: 3 }, 6)!;
    assert.deepEqual(a, again, 'seeded');
    assert.equal(a.danger, 3);
    assert.ok(Math.abs(a.shares.built + a.shares.water + a.shares.lava - 1) < 1e-9);
    assert.equal(a.shares.lava, 0, 'no lava in karst');
    rocks.add(a.rock); sizes.add(a.size);
    // A story of many rooms is never told in a cave that is too small for it.
    const many = caveSpecFor(caves, 'karst', { seed }, 20)!;
    assert.equal(many.size, 'big');
    assert.notEqual(caveSpecFor(caves, 'karst', { seed }, 10)!.size, 'small');
  }
  assert.deepEqual([...rocks].sort(), ['jointed', 'massive', 'thin-bedded']);
  assert.ok(sizes.has('small') && sizes.has('medium'));
  // Downs hold only the thin-bedded and the massive.
  for (let seed = 1; seed < 30; seed++) assert.ok(['thin-bedded', 'massive'].includes(caveSpecFor(caves, 'downs', { seed }, 4)!.rock));
});

test('cave tool: running along a cliff opens a cave in it now and then, away from the open ones, never many, and not without a way known (Arnd 2026-11-02)', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = startWorld();
  const n = classic.noticing!.caves!, t = terrain.towns[0].decision, a = (3 * Math.PI) / 8, way = { x: Math.cos(a), z: Math.sin(a) };
  const open = log.filter((d) => !(d.kind === 'dungeon' && d.template === 'cave'));
  const at = (k: number) => {
    const hero = { x: t.x + way.x * (450 + k * n.cell), z: t.z + way.z * (450 + k * n.cell) };
    return { seed, log: open, terrain, towns: terrain.towns, hours: 30, setting: classic, home, hero, toward: { x: hero.x + way.x * 400, z: hero.z + way.z * 400 } };
  };
  // Along the way a cave opens for some of the cells, and (the roll aside) in a cliff, ahead of them.
  const hits = Array.from({ length: 40 }, (_, k) => k).filter((k) => cliffCaveFor(at(k)) !== null);
  assert.ok(hits.length >= 1, 'a cave opens somewhere along the cliff');
  const k = hits[0], c = at(k), d = cliffCaveFor(c)!;
  assert.ok(siteInCliff((x, z) => terrain.height(x, z), d.site!), 'its mouth is in a cliff');
  assert.equal(cliffCaveFor({ ...c, toward: null }), null, 'no way known, none');
  assert.equal(cliffCaveFor({ ...c, setting: { ...classic, noticing: { ...classic.noticing!, caves: undefined } } }), null, 'a setting without them, none');
  // Open, it keeps the next away: none for the cells within its spacing of the hero.
  assert.equal(cliffCaveFor({ ...c, log: [...open, { ...d, site: { ...d.site!, x: c.hero.x + 10, z: c.hero.z } }] }), null, 'not while one is open near');
  // Nor more than `most` open round the hero, however far apart.
  const many = Array.from({ length: n.most }, (_, i) => ({ ...d, id: `c${i}`, site: { ...d.site!, x: c.hero.x + 900 + i * 5, z: c.hero.z } }));
  assert.equal(cliffCaveFor({ ...c, log: [...open, ...many] }), null, 'not while the most are open');
});

test('cave tool: a hero running along a cliff meets a cave within a few hundred metres, to the side of their way as well as ahead (Arnd 2026-11-02)', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = startWorld();
  const t = terrain.towns[0].decision, height = (x: number, z: number) => terrain.height(x, z);
  const open = log.filter((d) => !(d.kind === 'dungeon' && d.template === 'cave'));
  let walks = 0, met = 0, sideways = 0;
  for (let h = 0; h < 8; h++) {
    const a = (h / 8) * Math.PI * 2, way = { x: Math.cos(a), z: Math.sin(a) };
    walks++;
    // A run out of the town, a roll every 75 m of it, as the Builder's turn asks.
    for (let k = 0; k < 8; k++) {
      const hero = { x: t.x + way.x * (500 + k * 75), z: t.z + way.z * (500 + k * 75) };
      const d = caveFor({ seed: seed + k, log: open, terrain, towns: terrain.towns, hours: 30, setting: classic, home, hero, toward: { x: hero.x + way.x * 400, z: hero.z + way.z * 400 } });
      if (!d?.site) continue;
      assert.ok(siteInCliff(height, d.site), 'its mouth is in a cliff');
      const off = Math.abs(Math.atan2(d.site.z - hero.z, d.site.x - hero.x) - a);
      if (Math.min(off, 2 * Math.PI - off) > 0.7) sideways++;
      met++;
      break;
    }
  }
  assert.ok(met >= 3, `a cave within 600 m on ${met} of ${walks} runs`);
  assert.ok(sideways >= 1, 'one lies well off the way, along the cliff');
});
