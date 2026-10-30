import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_SECS, REPERTOIRE, Repertoire } from '../src/render/folk/repertoire';
import { clipOf, PACK_CLIPS } from '../src/render/folk/looks';
import type { ActivityKind } from '../src/sim/spots';

/** The clips `seed` shows doing `act` for `secs`, frame by frame at 60 fps: each clip with its seconds on screen. */
function run(seed: number, act: ActivityKind, secs: number): { clip: string; secs: number }[] {
  const r = new Repertoire(seed), out: { clip: string; secs: number }[] = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    const c = r.play(1 / 60, act)!;
    if (out.at(-1)?.clip === c) out.at(-1)!.secs += 1 / 60;
    else out.push({ clip: c, secs: 0 });
  }
  return out;
}

test('repertoire: every clip is shipped, timed, and each rests on the activity\'s own clip', () => {
  for (const [act, turns] of Object.entries(REPERTOIRE)) {
    assert.equal(turns![0].clip, clipOf(act as ActivityKind, 0), `${act} rests on its own clip`);
    for (const t of turns!) {
      assert.ok(PACK_CLIPS.includes(t.clip), `${t.clip} in the pack`);
      assert.ok(CLIP_SECS[t.clip] > 0, `${t.clip} timed`);
    }
  }
});

test('repertoire: a stall keeper goes through many clips, each played whole, and never one on repeat', () => {
  const seen = run(7, 'sell', 300);
  const clips = new Set(seen.map((s) => s.clip));
  assert.ok(clips.size >= 5, `only ${[...clips].join(', ')}`);
  for (const s of seen.slice(1, -1)) {
    const plays = s.secs / CLIP_SECS[s.clip];
    assert.ok(plays > 0.95, `${s.clip} cut after ${plays.toFixed(2)} plays`);
  }
  // Mostly at rest: the rest clip (idle) is the most shown.
  const time = (c: string) => seen.filter((s) => s.clip === c).reduce((a, s) => a + s.secs, 0);
  for (const c of clips) assert.ok(time('idle') >= time(c), `${c} more than idle`);
});

test('repertoire: neighbours fall out of step, and a person is the same each time (seeded)', () => {
  const a = run(1, 'sell', 60).map((s) => s.clip).join(), b = run(2, 'sell', 60).map((s) => s.clip).join();
  assert.notEqual(a, b);
  assert.equal(run(1, 'sell', 60).map((s) => s.clip).join(), a);
});

test('repertoire: work and sitting keep their one clip', () => {
  const r = new Repertoire(3);
  assert.equal(r.play(0.1, 'smith'), null);
  assert.equal(r.play(0.1, 'sit'), null);
  assert.equal(r.play(0.1, 'chat'), 'talk');
});
