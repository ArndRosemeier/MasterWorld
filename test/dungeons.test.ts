import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeed } from '@futuremagic/core';
import { nextSetPiece } from '../src/vgm/dungeons';
import { setPiecesFor } from '../src/world/dungeon/setPieces';

const SET_PIECES = setPiecesFor('cellar');

test('vgm: no set piece repeats until the library has been used through', () => {
  for (let w = 0; w < 5; w++) {
    const used: string[] = [];
    for (let i = 0; i < SET_PIECES.length * 2; i++) used.push(nextSetPiece(used, deriveSeed(w, 'cellar', i)));
    assert.equal(new Set(used.slice(0, SET_PIECES.length)).size, SET_PIECES.length, 'the first round: each once');
    assert.equal(new Set(used.slice(SET_PIECES.length)).size, SET_PIECES.length, 'the second round: each once more');
  }
});

test('vgm: dungeonFor gives a place of a kind for the purpose, with the dwellers asked for', async () => {
  const { parseSeed } = await import('@futuremagic/core');
  const { classic } = await import('../src/setting/classic/index');
  const { openWorld } = await import('../src/vgm/builder');
  const { dungeonFor, loreOf, placeOf } = await import('../src/vgm/dungeons');
  const { sketchCellar } = await import('../src/world/dungeon/cellar');
  const { SMALL } = await import('./small');
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = openWorld(seed, classic, SMALL);
  const town = terrain.towns[0];
  const c = { seed, terrain, log, home, dungeons: classic.dungeons };
  const d = dungeonFor({ purpose: 'hideout', town, dwellers: 'highwaymen', kinds: ['hideout'] }, c)!;
  assert.ok(d, 'a hideout is found');
  assert.equal(d.template, 'hideout');
  assert.equal(d.dwellers, 'highwaymen');
  const s = sketchCellar(d, placeOf(d, terrain.towns, classic.dungeons)!, loreOf(classic, 'hideout'));
  assert.equal(s.dweller.encounter, 'highwaymen', 'the asked-for dwellers live there');
  const any = dungeonFor({ purpose: 'hideout', town }, c)!;
  assert.ok(['cave', 'tower', 'hideout'].includes(any.template), 'only kinds for the purpose');
  assert.equal(dungeonFor({ purpose: 'den', town, dwellers: 'boar' }, c), null, 'no kind is a den for boars');
  const near = { x: town.decision.x + 900, z: town.decision.z, ring: [0, 400] as const };
  const by = dungeonFor({ purpose: 'hideout', town, near, kinds: ['hideout', 'cave'] }, c);
  if (by) assert.ok(Math.hypot(by.site!.x - near.x, by.site!.z - near.z) <= 450, 'near the point asked');
});

test('vgm: a retake changes who lives in a place and keeps its layout', async () => {
  const { parseSeed } = await import('@futuremagic/core');
  const { classic } = await import('../src/setting/classic/index');
  const { openWorld } = await import('../src/vgm/builder');
  const { dungeonFor, loreOf, placeOf, retakeOf } = await import('../src/vgm/dungeons');
  const { dwellersOf } = await import('../src/vgm/leads');
  const { moveIn, outlineCellar, sketchCellar } = await import('../src/world/dungeon/cellar');
  const { SMALL } = await import('./small');
  const seed = parseSeed('masterworld');
  const { terrain, log, home } = openWorld(seed, classic, SMALL);
  const d = dungeonFor({ purpose: 'hideout', town: terrain.towns[0], dwellers: 'smugglers', kinds: ['hideout'] }, { seed, terrain, log, home, dungeons: classic.dungeons })!;
  const lore = loreOf(classic, d.template), house = placeOf(d, terrain.towns, classic.dungeons)!;
  const withD = [...log, d];
  const r = retakeOf(withD, classic.dungeons, d.id, 'highwaymen', seed, 5)!;
  assert.ok(r, 'the highwaymen take it');
  assert.equal(retakeOf(withD, classic.dungeons, d.id, 'ghoul', seed, 5), null, 'no ghoul in a hideout');
  const after = [...withD, r];
  assert.equal(retakeOf(after, classic.dungeons, d.id, 'highwaymen', seed, 6), null, 'they are there already');
  assert.equal(dwellersOf(after, d)?.id, r.id);
  const was = sketchCellar(d, house, lore), now = sketchCellar(d, house, lore, dwellersOf(after, d));
  assert.equal(was.dweller.encounter, 'smugglers');
  assert.equal(now.dweller.encounter, 'highwaymen');
  assert.equal(now.taken, r.id);
  assert.deepEqual(now.history.slice(0, -1).map((h) => h.def.id), was.history.slice(0, -1).map((h) => h.def.id), 'the history below stays');
  const a = outlineCellar(d, house, lore), b = moveIn(a, r, house, lore);
  assert.equal(b.graph, a.graph, 'the same rooms and ways');
  assert.equal(b.rooms, a.rooms);
  assert.equal(b.dweller.encounter, 'highwaymen');
});
