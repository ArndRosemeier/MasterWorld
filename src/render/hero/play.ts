/**
 * Playing a clip on an Actors person: looping, or once from its start and held at its end (a blow, a
 * flinch, a death), optionally stretched to `dur` seconds, blended in over `fade` seconds (0 cuts).
 * Shared by everyone drawn as an Actors person.
 */
import { LoopOnce } from 'three/webgpu';
import type { Character } from '@actors/generator';

/** Cross-fades (s): between gaits, and into a blow, a flinch or a fall (quicker, so it lands in time). */
export const FADE = { loop: 0.25, once: 0.1 } as const;

/** Plays `clip` on `ch`; `still()` says whether it is still wanted once loaded (another may have come since). */
export function playClip(ch: Character, clip: string, once: boolean, still: () => boolean, dur?: number, fade = 0): void {
  void ch.play(clip, fade).then(() => {
    const a = ch.actor.currentAction;
    if (!a || !once || !still()) return;
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    // From the start (a blow again restarts it), still fading in: no reset(), which would stop the fade.
    a.time = 0;
    a.paused = false;
    a.enabled = true;
    if (dur) a.timeScale = a.getClip().duration / dur;
  });
}
