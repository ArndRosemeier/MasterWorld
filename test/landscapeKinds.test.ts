import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Skeleton } from '../src/world/skeleton';

/** Near the start town of seed masterworld (in a mesa valley, L5). */
const START = { x: -23900, z: 36100 };

test('landscape kinds (L7): a long walk passes through every kind, each with its own shapes and plants', () => {
  const sk = new Skeleton(parseSeed('masterworld'), classic.world);
  const ids = sk.kinds.map((k) => k.id), seen = new Map<string, { x: number; z: number }>();
  // A long walk: a spiral out from round the start (seed masterworld).
  for (const id of ids) { const at = sk.nearestKind(id, START.x, START.z); if (at) seen.set(id, at); }
  assert.deepEqual([...seen.keys()].sort(), [...ids].sort(), 'every kind is met');
  for (const d of sk.kinds) {
    const at = seen.get(d.id)!;
    if (d.bare) assert.ok(Math.abs(sk.bareAt(at.x, at.z) - d.bare) < 0.05, `${d.id} is as bare as it says`);
  }
  assert.equal(sk.bareAt(seen.get('open')!.x, seen.get('open')!.z), 0, 'open country keeps its plants');
});
