/**
 * Music and sounds (plan 16, D44: made with OpenRouter, listed in tools/sound/sounds.json, files in public/sound/),
 * played by the shared engine (@futuremagic/audio). Browsers only allow sound after the player has pressed something:
 * the engine opens on the first click or key, and music asked for before plays then.
 *
 * The title plays its effects and theme through here; in the game `SoundDirector` (soundDirector.ts) sets the beds,
 * steps and music every frame on `engine`.
 */
import { AudioEngine } from '@futuremagic/audio/web';

export type Effect = 'bell' | 'birds' | 'click' | 'dive' | 'dragon' | 'gear' | 'splash' | 'thunder' | 'ward' | 'wind';

/** Loudness of each title effect against the others (the files are levelled alike). */
const MIX: Record<Effect, number> = { bell: 0.7, birds: 0.6, click: 0.35, dive: 0.6, dragon: 0.8, gear: 0.5, splash: 0.6, thunder: 0.8, ward: 0.5, wind: 0.45 };

/** Loudness of the buses under the master volume. */
const BUSES = { music: 0.55, world: 1, body: 0.8, ui: 0.7 } as const;

export class Sound {
  readonly engine: AudioEngine;
  private master = 0.8;

  constructor(seed = 0x6d77) {
    this.engine = new AudioEngine({ base: `${import.meta.env.BASE_URL}sound/`, seed });
    for (const [bus, v] of Object.entries(BUSES)) this.engine.setVolume(bus as keyof typeof BUSES, v);
    this.engine.setVolume('master', this.master);
  }

  /** Master volume, 0..1 (the setting). */
  get volume(): number { return this.master; }
  set volume(v: number) {
    this.master = v;
    this.engine.setVolume('master', v);
  }

  /** Sound is allowed now (from a press). */
  allow(): void { this.engine.unlock(); }

  /** Starts a piece of music (an id in public/sound, e.g. `music/title`), crossfading from what plays. */
  playMusic(piece: string, fade = 2.5): void { this.engine.music(piece, fade); }

  /** Fades the music to `level` (0..1) over `seconds`; to 0 with `stop` it ends. */
  fadeMusic(level: number, seconds: number, stop = false): void {
    if (stop) this.engine.music(null, seconds);
    else this.engine.duck(level, seconds);
  }

  /** A title effect. */
  play(effect: Effect, level = 1): void {
    this.engine.play(`title/${effect}`, { gain: MIX[effect] * level, bus: 'ui' });
  }

  /** Called every frame. */
  tick(_dt: number): void { this.engine.update(); }
}
