import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { caveFor } from '../src/vgm/caves';
import { dungeonFor, loreOf, placeOf } from '../src/vgm/dungeons';
import { answerNeed } from '../src/vgm/toolbox';
import { siteInCliff } from '../src/world/dungeon/caveMouth';
import { isEmpty, outlineCellar, sketchCellar } from '../src/world/dungeon/cellar';
import { caveGlows, caveSeed, torchSpots } from '../src/world/dungeon/torches';
import { caveFeatures } from '../src/world/dungeon/caveFeatures';
import { SMALL } from './small';

test('cave tool: Discovery overdue near a cliff opens a cave in it, one at a time', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = openWorld(seed, classic, SMALL);
  const town = terrain.towns[0], height = (x: number, z: number) => terrain.height(x, z);
  // A cliff near the town (the way the Builder finds one), and the hero out on the land before it.
  const cliff = dungeonFor({ purpose: 'lead', town, kinds: ['cave'] }, { seed, terrain, log: [], home, dungeons: classic.dungeons });
  assert.ok(cliff?.site && siteInCliff(height, cliff.site), 'the masterworld seed has a cliff by its town');
  const s = cliff.site, hero = { x: s.x + Math.sin(s.yaw) * 250, z: s.z + Math.cos(s.yaw) * 250 };
  const open = log.filter((d) => !(d.kind === 'dungeon' && d.template === 'cave'));
  const c = { seed, log: open, terrain, towns: terrain.towns, hours: 30, setting: classic, home, hero, toward: null };
  const d = caveFor(c);
  assert.ok(d?.site, 'a cave is opened');
  assert.equal(d.template, 'cave');
  assert.ok(siteInCliff(height, d.site), 'its mouth is in a cliff');
  assert.ok(Math.hypot(d.site.x - hero.x, d.site.z - hero.z) < 500, 'near the hero');
  assert.equal(d.at, 30);
  assert.equal(caveFor({ ...c, log: [...open, d] }), null, 'not another while it is open near');
  const m = answerNeed('discovery', c);
  assert.equal(m?.tool, 'cave', 'Discovery asks the cave tool first');
  assert.match(m.reason, /cave in a cliff/);
});

test('caves: a share stand empty, sights with nobody in them; asked-for dwellers are always there', () => {
  const seed = parseSeed('masterworld');
  const { terrain, home } = openWorld(seed, classic, SMALL);
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
