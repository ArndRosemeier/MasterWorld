import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MUSIC, hoofSound, musicMood, soundscape, stepSound, type Footing, type Hearing } from '../src/game/soundscape';

const index = JSON.parse(readFileSync(new URL('../public/sound/index.json', import.meta.url), 'utf8')) as { sounds: Record<string, { files: string[] }> };

const land: Hearing = {
  hour: 12, place: 'land', room: null, under: false, rain: 0, snow: 0, wind: 0.3, storm: 0, height: 60, sea: Infinity, water: Infinity,
  river: null, fall: null, town: 0, woods: 0, conifer: 0,
};
const foot: Footing = { place: 'land', room: null, wading: false, town: null, surface: 'grass', rock: false, snow: 0, beach: false };

test('soundscape: meadow by day, woods at night, a storm, the sea, a river and a fall', () => {
  const meadow = soundscape(land).beds;
  assert.ok(meadow['bed/birds-meadow'] > 0.3 && meadow['bed/grass'] > 0.1 && meadow['bed/wind-soft'] > 0);
  assert.equal(meadow['bed/crickets'], undefined);
  const night = soundscape({ ...land, hour: 23, woods: 0.8 }).beds;
  assert.ok(night['bed/crickets'] > 0 && night['bed/leaves-broad'] > 0);
  assert.equal(night['bed/birds-wood'], undefined);
  const storm = soundscape({ ...land, rain: 0.9, storm: 1, wind: 0.9 }).beds;
  assert.ok(storm['bed/rain-heavy'] > 0.5 && storm['bed/storm-wind'] > 0.5);
  assert.equal(storm['bed/birds-meadow'], undefined);
  assert.ok(soundscape({ ...land, sea: 10, height: 2 }).beds['bed/sea'] > 0.9);
  assert.ok(soundscape({ ...land, sea: 10, height: 30 }).beds['bed/surf-rocks'] > 0.9);
  assert.ok(soundscape({ ...land, river: { bank: 2, half: 3 } }).beds['bed/river-riffle'] > 0.8);
  assert.ok(soundscape({ ...land, fall: { dist: 50, drop: 25 } }).beds['bed/falls'] > 0.5);
  // S10: aboard, the timbers creak, more in the wind; a gale at sea roars, aboard and on the shore; calm, it does not.
  const deck = soundscape({ ...land, sea: 0, height: 0, aboard: true }).beds, gale = soundscape({ ...land, sea: 0, height: 0, aboard: true, wind: 0.95, storm: 1 }).beds;
  assert.ok(deck['bed/ship-creak'] > 0.4 && gale['bed/ship-creak'] > deck['bed/ship-creak']);
  assert.equal(deck['bed/sea-storm'], undefined);
  assert.ok(gale['bed/sea-storm'] > 0.8);
  assert.ok(soundscape({ ...land, sea: 10, height: 2, wind: 0.95, storm: 1 }).beds['bed/sea-storm'] > 0.8);
  assert.equal(soundscape({ ...land, sea: 10, height: 2 }).beds['bed/ship-creak'], undefined);
});

test('soundscape: rooms, the cellar and under water', () => {
  const inn = soundscape({ ...land, place: 'room', room: 'inn', rain: 0.5 });
  assert.ok(inn.beds['bed/inn'] > 0.5 && inn.beds['bed/rain-roof'] > 0.3 && inn.echo.wet > 0);
  assert.equal(inn.beds['bed/birds-meadow'], undefined);
  assert.ok(soundscape({ ...land, place: 'room', room: 'temple' }).echo.t60 > 2);
  assert.ok(soundscape({ ...land, place: 'cellar' }).beds['bed/cellar'] > 0.5);
  const under = soundscape({ ...land, under: true });
  assert.deepEqual(Object.keys(under.beds), ['bed/underwater']);
  assert.ok(under.muffle !== null && under.muffle < 1000);
});

test('music: the place and the time pick the mood, danger and fights win', () => {
  assert.equal(musicMood(land), 'day');
  assert.equal(musicMood({ ...land, hour: 6 }), 'dawn');
  assert.equal(musicMood({ ...land, hour: 23 }), 'night');
  assert.equal(musicMood({ ...land, town: 0.8 }), 'town');
  assert.equal(musicMood({ ...land, place: 'room', room: 'inn' }), 'inn');
  assert.equal(musicMood({ ...land, place: 'cellar' }), 'cellar');
  assert.equal(musicMood({ ...land, storm: 0.8, rain: 0.8 }), 'storm');
  assert.equal(musicMood({ ...land, place: 'cellar' }, 'tension'), 'danger');
  assert.equal(musicMood({ ...land, place: 'cellar' }, 'fight'), 'fight');
});

test('steps: the ground under the foot', () => {
  assert.equal(stepSound(foot), 'step/grass');
  assert.equal(stepSound({ ...foot, surface: 'forest' }), 'step/litter');
  assert.equal(stepSound({ ...foot, town: 'market' }), 'step/cobbles');
  assert.equal(stepSound({ ...foot, town: 'yard' }), 'step/dirt');
  assert.equal(stepSound({ ...foot, wading: true, town: 'street' }), 'step/water');
  assert.equal(stepSound({ ...foot, snow: 0.8 }), 'step/snow');
  assert.equal(stepSound({ ...foot, beach: true }), 'step/sand');
  assert.equal(stepSound({ ...foot, rock: true }), 'step/stone');
  assert.equal(stepSound({ ...foot, place: 'room', room: 'inn' }), 'step/boards');
  assert.equal(stepSound({ ...foot, place: 'cellar' }), 'step/rock');
  assert.equal(hoofSound({ ...foot, town: 'street' }, 'walk'), 'hoof/cobbles');
  assert.equal(hoofSound(foot, 'trot'), 'hoof/grass');
  assert.equal(hoofSound(foot, 'gallop'), 'hoof/gallop');
});

test('every sound the game names is in public/sound', () => {
  const named = new Set<string>(Object.values(MUSIC).flat());
  const hearings: Hearing[] = [];
  for (const hour of [3, 6, 12, 18, 22]) for (const place of ['land', 'room', 'cellar'] as const) for (const room of ['inn', 'temple', 'hall', 'smithy', 'mill', 'bakery', 'stable', 'house']) {
    hearings.push({ ...land, hour, place, room, rain: 0.6, snow: 0.3, wind: 0.8, storm: 0.5, sea: 20, water: 5, river: { bank: 1, half: 8 }, fall: { dist: 40, drop: 20 }, town: 0.5, woods: 0.5, conifer: 0.5 });
    hearings.push({ ...land, hour, place, room, height: 1500, wind: 0.2, river: { bank: 1, half: 2 } });
  }
  hearings.push({ ...land, under: true });
  for (const h of hearings) for (const id of Object.keys(soundscape(h).beds)) named.add(id);
  for (const town of [null, 'street', 'market', 'yard'] as const) for (const surface of ['grass', 'forest', 'sand', 'scree']) for (const place of ['land', 'room', 'cellar'] as const) {
    const f = { ...foot, town, surface, place, room: 'temple' };
    named.add(stepSound(f)); named.add(stepSound({ ...f, wading: true })); named.add(stepSound({ ...f, snow: 1 })); named.add(stepSound({ ...f, rock: true }));
    for (const gait of ['walk', 'trot', 'gallop']) named.add(hoofSound(f, gait));
  }
  // The director's own (src/app/soundDirector.ts).
  const director = readFileSync(new URL('../src/app/soundDirector.ts', import.meta.url), 'utf8');
  for (const m of director.matchAll(/'((?:step|body|swim|ui|door|hatch|ladder|fight|cry|call|thunder|loop|title|hoof|horse)\/[a-z-]+)'/g)) named.add(m[1]);
  for (const id of named) assert.ok(index.sounds[id]?.files.length, `${id} is not in public/sound/index.json`);
});
