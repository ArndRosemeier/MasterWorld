import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeText, numberChanges, versionName } from '../tools/release/release';

test('release: one commit on main is 0.001 more', () => {
  assert.equal(versionName(1), '0.001');
  assert.equal(versionName(42), '0.042');
  assert.equal(versionName(1000), '1.000');
  const c = numberChanges(['2026-10-25\tSettings dialog (#24)', '2026-10-26\tWeather: rain (#25)'], true);
  assert.deepEqual(c, [
    { version: '0.002', date: '2026-10-26', text: 'Weather: rain' },
    { version: '0.001', date: '2026-10-25', text: 'Settings dialog' },
  ]);
  assert.equal(changeText('Trees (#7) and more'), 'Trees (#7) and more');
});
