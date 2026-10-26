import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { plainItem } from '../src/game/items';
import { GAME_MODES, MODE_TEXT, epitaph, fallClassic, fallRoguelike, gather, remainsId, remainsLead, remainsNear, type FallPlace } from '../src/game/death';
import { SAVE_VERSION, checkSave, heirSave, remainsEntry, type SaveData } from '../src/app/saveGame';
import { Journal } from '../src/talk/journal';

const cellar: FallPlace = { x: 10, y: -4, z: 20, below: 'cellar-1', mark: { x: 12, z: 30 }, label: "in the Ashby house's cellar" };
const land: FallPlace = { x: 100, y: 50, z: 200, below: null, mark: { x: 100, z: 200 }, label: 'out on the land' };

/** A hero with gear on, a full pack and a purse. */
function hero(): Character {
  const c = new Character(classic);
  c.pack.push(plainItem(classic.items, classic.items.items.find((i) => i.kind === 'potion')!.id), plainItem(classic.items, classic.items.items.find((i) => i.kind === 'weapon')!.id));
  c.coins = 301;
  return c;
}

test('death: the New game screen offers both modes, each with what it means', () => {
  assert.deepEqual([...GAME_MODES], ['classic', 'roguelike']);
  for (const m of GAME_MODES) assert.ok(MODE_TEXT[m].name && MODE_TEXT[m].text.length > 20);
});

test('death (classic): the pack stays where the hero fell, the worn gear stays on, half the purse goes', () => {
  const c = hero(), worn = { ...c.worn }, pack = [...c.pack];
  c.health = 0;
  const { remains, lost } = fallClassic(c, cellar, remainsId(30.5), 1);
  assert.equal(lost, 150);
  assert.equal(c.coins, 151);
  assert.deepEqual(c.pack, []);
  assert.deepEqual(c.worn, worn);
  assert.ok(c.alive && c.health === Math.round(c.maxHealth / 2));
  assert.ok(remains);
  assert.deepEqual(remains.items, pack);
  assert.equal(remains.grave, null);
  assert.equal(remains.id, 'remains-1830');
  // An empty pack leaves nothing behind.
  assert.equal(fallClassic(c, land, 'x', 1).remains, null);
});

test('death (classic): going back for the pack: found only in the same place and close by', () => {
  const c = hero(), had = c.pack.length, { remains } = fallClassic(c, cellar, 'r', 0);
  const all = [remains!];
  assert.equal(remainsNear(all, null, cellar.x, cellar.y, cellar.z), null, 'not out on the land');
  assert.equal(remainsNear(all, 'cellar-2', cellar.x, cellar.y, cellar.z), null, 'not in another cellar');
  assert.equal(remainsNear(all, 'cellar-1', cellar.x + 5, cellar.y, cellar.z), null, 'not from across the room');
  const r = remainsNear(all, 'cellar-1', cellar.x + 1, cellar.y, cellar.z + 1);
  assert.equal(r, remains);
  gather(c, r!);
  assert.equal(c.pack.length, had);
});

test('death (classic): the journal and the map mark the place, and the lead closes once the pack is taken up', () => {
  const c = hero(), n = c.pack.length, { remains } = fallClassic(c, cellar, 'remains-9', 2);
  const j = new Journal();
  j.remember(remainsEntry(remains!));
  assert.equal(j.open.length, 1);
  assert.deepEqual(j.open[0].mark, { x: 12, z: 30, label: 'Your pack' });
  assert.match(j.open[0].notes[0].text, new RegExp(`You fell in the Ashby house's cellar\\. ${n} things`));
  j.fulfil('remains-9');
  assert.equal(j.open.length, 0);
});

test('death (roguelike): the tale ends, all the hero had becomes a grave, and the world goes on for the next hero', () => {
  const c = hero(), carried = c.pack.length;
  const grave = fallRoguelike(c, 'Wenna Stonehelm', land, 'remains-77', 4);
  const worn = Object.values(c.worn).filter(Boolean).length;
  assert.equal(grave.items.length, worn + carried);
  assert.equal(grave.coins, 301);
  assert.equal(grave.grave, 'Wenna Stonehelm');
  assert.match(remainsLead(grave).title, /Where Wenna Stonehelm fell/);
  assert.match(epitaph('Wenna Stonehelm', 4, land), /fell out on the land on day 5/);

  const was: SaveData = {
    version: SAVE_VERSION, game: '0.1', setting: { id: 'classic', version: 1 }, seed: 'masterworld', log: [{ kind: 'x' } as never],
    clock: { day: 4, hour: 9 }, hero: { x: 1, y: 2, z: 3, yaw: 1, below: true, cellar: 'cellar-1' }, cellars: { 'cellar-1': { open: [1], keys: [], read: [] } },
    talk: null, journal: [{ id: 'cellar-1', title: 'The cellar', notes: [], mark: { x: 0, z: 0, label: 'here' }, done: false }],
    character: c.save(), director: null, looks: { name: 'Wenna Stonehelm', look: {} }, mode: 'roguelike', remains: [],
  };
  const heir = heirSave(was, grave, { x: 5, y: 0, z: 6, yaw: 0, below: false });
  // The hero is gone: a new one is made in the same world.
  assert.equal(heir.heir, true);
  assert.equal(heir.mode, 'roguelike');
  assert.equal(heir.character, null);
  assert.equal(heir.looks, null);
  assert.equal(heir.hero.below, false);
  // The world stays: its ledger, the places and the clock.
  assert.deepEqual(heir.log, was.log);
  assert.deepEqual(heir.cellars, was.cellars);
  assert.deepEqual(heir.clock, was.clock);
  // The next hero knows one thing: where the last one fell; the grave lies there.
  assert.deepEqual(heir.journal.map((l) => l.id), ['remains-77']);
  assert.deepEqual(heir.remains, [grave]);
  assert.deepEqual(checkSave(JSON.parse(JSON.stringify(heir)), { id: 'classic', version: 1 }), heir);
});

test('death: a save from before modes loads as classic with nothing left anywhere', () => {
  const { mode: _m, remains: _r, ...old } = { version: 3, game: '0.1', setting: { id: 'classic', version: 1 }, seed: 's', log: [], clock: { day: 0, hour: 9 }, hero: { x: 0, y: 0, z: 0, yaw: 0, below: false }, cellars: {}, talk: null, journal: [], character: null, director: null, looks: null, mode: 'x', remains: 'x' };
  const back = checkSave(old, { id: 'classic', version: 1 }) as SaveData;
  assert.equal(back.version, SAVE_VERSION);
  assert.equal(back.mode, 'classic');
  assert.deepEqual(back.remains, []);
});
