/**
 * Playing a clip on an Actors person: looping, or once from its start and held at its end (a blow, a
 * flinch, a death), optionally stretched to `dur` seconds. Shared by everyone drawn as an Actors person.
 */
import { LoopOnce } from 'three/webgpu';
import type { Character } from '@actors/generator';

/** Plays `clip` on `ch`; `still()` says whether it is still wanted once loaded (another may have come since). */
export function playClip(ch: Character, clip: string, once: boolean, still: () => boolean, dur?: number): void {
  void ch.play(clip).then(() => {
    const a = ch.actor.currentAction;
    if (!a || !once || !still()) return;
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    a.reset().play();
    if (dur) a.timeScale = a.getClip().duration / dur;
  });
}
