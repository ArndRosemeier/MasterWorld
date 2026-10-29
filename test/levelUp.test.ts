import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { CHEER, LevelWatch } from '../src/app/levelUp';
import { LevelRing, RING_TIME } from '../src/app/spellFx/levelRing';
import { SpellBits } from '../src/app/spellFx/particles';
import { ACTION_CLIPS, HERO_CLIPS } from '../src/render/hero/clips';
import { cellarFight } from './fightKit';

test('level up: a level gained mid-fight plays the ring without the gesture; out of a fight with it (G3)', () => {
  const { d, hero, foe, pose } = cellarFight(7, 2.5);
  const watch = new LevelWatch(hero.level);
  d.step(0.01, pose);
  d.fight.pick(foe);
  assert.equal(watch.see(hero.level, false), null, 'nothing before a level');
  hero.gain(classic.growth.xp[1] - hero.xp);
  const fighting = watch.see(hero.level, false);
  assert.deepEqual(fighting, { level: 2, gained: 1, gesture: false });
  assert.equal(watch.see(hero.level, true), null, 'once per level');
  // Two levels at once: one celebration, the hands raised when free.
  const calm = new Character(classic), w = new LevelWatch(calm.level);
  calm.gain(classic.growth.xp[2]);
  assert.deepEqual(w.see(calm.level, true), { level: 3, gained: 2, gesture: true });
  // The gesture is a clip the hero has.
  assert.ok(HERO_CLIPS.includes(ACTION_CLIPS[CHEER.id]!));
});

test('level up: the ring rises from the feet above the head in brass and is gone after its time, never holding play', () => {
  const b = new SpellBits(5), ring = new LevelRing(), feet = [10, 2, -4] as const;
  assert.equal(ring.on, false);
  ring.kindle(b, feet);
  assert.ok(ring.on && b.parts.length > 0, 'the first flare of sparks');
  const heights: number[] = [];
  for (let t = 0; t < RING_TIME + 0.2; t += 1 / 30) {
    b.held.length = 0;
    ring.rise(b, feet, 1 / 30);
    b.step(1 / 30);
    const r = b.held.find((h) => h.sprite === 4);
    if (r) heights.push(r.y);
  }
  assert.equal(ring.on, false, 'over by itself');
  assert.ok(heights[0]! < feet[1] + 0.3 && Math.max(...heights) > feet[1] + 1.3, `rises from ${heights[0]} to ${Math.max(...heights)}`);
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i]! >= heights[i - 1]! - 1e-9, 'only up');
});
