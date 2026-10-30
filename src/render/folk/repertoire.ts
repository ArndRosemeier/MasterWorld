/**
 * What people standing about do with themselves (Arnd 2026-10-30: a stall keeper played one clip on repeat). Each
 * standing activity has a repertoire: its rest clip, held a few loops, and now and then something else from Actors'
 * library played through whole (folding the arms, a nod, reaching over the counter, a sip). Each person goes
 * through it in their own order and pace (from their seed), so neighbours never move in step. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { ActivityKind } from '../../sim/spots';

/** One thing in a repertoire: a clip, how often it comes up, and how many times through it plays then. */
export interface Turn {
  clip: string;
  weight: number;
  plays: readonly [number, number];
}

/** Seconds one play of each clip takes (the pack's frame counts at 30 fps). */
export const CLIP_SECS: Readonly<Record<string, number>> = {
  idle: 76 / 30, talk: 89 / 30, 'arms folded': 76 / 30, nod: 76 / 30, 'shake head': 76 / 30, interact: 61 / 30,
  'pick up': 26 / 30, 'eat or drink': 41 / 30, crouch: 89 / 30, dance: 31 / 30,
  // Cut from motion capture (render/folk/moves.ts): as long as `npm run packs` prints them.
  'dance folk': 117 / 30, 'dance folk 2': 65 / 30, laugh: 77 / 30, cheer: 47 / 30,
};

const rest = (clip: string, weight = 4, plays: readonly [number, number] = [2, 5]): Turn => ({ clip, weight, plays });
const now = (clip: string, weight: number, plays: readonly [number, number] = [1, 1]): Turn => ({ clip, weight, plays });

/**
 * The repertoire of each standing activity; the first turn is the rest clip it begins and mostly stays with.
 * Activities not here play their one clip (work with a tool, sitting, walking, asleep).
 */
export const REPERTOIRE: Partial<Readonly<Record<ActivityKind, readonly Turn[]>>> = {
  // Behind a market stall: waiting for buyers, calling to them, setting the wares straight, haggling, a sip.
  sell: [rest('idle'), now('talk', 2, [1, 3]), now('arms folded', 2, [2, 4]), now('interact', 2, [1, 2]), now('pick up', 1.5, [1, 2]),
    now('nod', 1), now('shake head', 1), now('eat or drink', 0.5)],
  // At the tap or the counter: much the same, busier with the hands.
  serve: [rest('idle', 3), now('interact', 3, [1, 2]), now('pick up', 2, [1, 2]), now('talk', 2, [1, 2]), now('nod', 1), now('arms folded', 1, [1, 3])],
  // At a stall as a buyer: looking the wares over, picking one up, yes or no.
  browse: [rest('arms folded', 3, [1, 3]), now('idle', 2, [1, 3]), now('pick up', 2, [1, 2]), now('interact', 1.5), now('nod', 1), now('shake head', 1.5)],
  // Talking in a group.
  chat: [rest('talk', 4, [1, 4]), now('nod', 2), now('shake head', 1), now('idle', 1.5, [1, 2]), now('arms folded', 1.5, [1, 3])],
  // Waiting, or gathered for a rite or a crier.
  wait: [rest('idle', 5, [2, 6]), now('arms folded', 2, [2, 4]), now('shake head', 0.5), now('eat or drink', 0.5)],
  gather: [rest('idle', 5, [2, 6]), now('arms folded', 2, [2, 4]), now('nod', 1), now('talk', 0.5)],
  // At a grave: still, arms folded, now and then down on one knee.
  mourn: [rest('arms folded', 4, [2, 5]), now('idle', 2, [2, 3]), now('crouch', 1, [1, 2])],
  // At a feast, in the ring: one folk dance after another, a whoop now and then.
  dance: [rest('dance folk', 3, [2, 4]), now('dance folk 2', 3, [2, 4]), now('cheer', 0.7)],
  // Round the ring: a drink raised, a laugh, a cheer for the dancers, a word with the neighbour.
  revel: [rest('idle', 3, [1, 3]), now('eat or drink', 2.5), now('laugh', 2), now('cheer', 2), now('talk', 2, [1, 2]), now('nod', 1), now('arms folded', 1, [1, 2])],
  // Children at play: dancing a round, standing a while, crouching down to something.
  play: [rest('idle', 2, [1, 3]), now('dance', 3, [2, 6]), now('crouch', 1, [1, 2])],
};

/**
 * One person going through the repertoire of what they do: `play` each frame gives the clip to show. A new activity
 * begins again at its rest clip (held a share of its plays chosen from the seed, so neighbours fall out of step).
 */
export class Repertoire {
  private act: ActivityKind | null = null;
  private clip = '';
  private left = 0;
  private count = 0;

  constructor(private readonly seed: number) {}

  /** The clip for `act` after `dt` seconds more, or null when `act` has no repertoire. */
  play(dt: number, act: ActivityKind): string | null {
    const turns = REPERTOIRE[act];
    if (!turns) { this.act = null; return null; }
    if (act !== this.act) {
      this.act = act;
      this.clip = turns[0].clip;
      // Somewhere into the rest clip's plays, so people who began together part soon.
      this.left = (CLIP_SECS[this.clip] ?? 2.5) * this.rng().range(0.5, turns[0].plays[1]);
      return this.clip;
    }
    this.left -= dt;
    if (this.left > 0) return this.clip;
    const r = this.rng();
    // Never the same accent twice running; back to rest between accents more often than not.
    const was = this.clip, restClip = turns[0].clip;
    const t = was !== restClip && r.chance(0.6) ? turns[0] : r.weighted(turns, (u) => (u.clip === was ? 0 : u.weight));
    this.clip = t.clip;
    this.left += (CLIP_SECS[t.clip] ?? 2.5) * r.int(t.plays[0], t.plays[1]);
    return this.clip;
  }

  private rng(): Rng { return new Rng(deriveSeed(this.seed, 'idle', this.count++)); }
}
