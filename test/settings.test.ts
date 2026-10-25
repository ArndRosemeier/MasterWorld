import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, DEFAULT_SETTINGS, SettingsStore } from '../src/app/settings';

test('settings: stored values are held to their ranges and types', () => {
  const s = cleanSettings({ mouseSpeed: 99, fov: 'wide', hud: true, trees: 1, dayMinutes: -5 });
  assert.equal(s.mouseSpeed, 3);
  assert.equal(s.fov, DEFAULT_SETTINGS.fov);
  assert.equal(s.hud, true);
  assert.equal(s.trees, true);
  assert.equal(s.dayMinutes, 0);
  assert.deepEqual(cleanSettings(null), DEFAULT_SETTINGS);
});

test('settings: a change reaches the watchers; without storage the defaults hold', () => {
  const store = new SettingsStore();
  const seen: number[] = [];
  store.watch((s) => seen.push(s.fov));
  store.set({ fov: 70 });
  assert.deepEqual(seen, [55, 70]);
  assert.deepEqual(store.start, { webgl: false, trees: true, grass: true, dayMinutes: 0 });
});
