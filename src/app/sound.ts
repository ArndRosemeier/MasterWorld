/**
 * Music and sound effects (plan D40: made with OpenRouter, files in public/title/). Music streams through a
 * media element (never decoded whole); effects are short files played on fresh elements so they can
 * overlap. Browsers only allow sound after the player has pressed something: `unlock` is called on the
 * first click or key, and music asked for before plays then.
 */
export type Effect = 'bell' | 'birds' | 'click' | 'dive' | 'dragon' | 'gear' | 'splash' | 'thunder' | 'ward' | 'wind';

/** Loudness of each effect against the others (the files are normalised alike). */
const MIX: Record<Effect, number> = { bell: 0.7, birds: 0.6, click: 0.35, dive: 0.6, dragon: 0.8, gear: 0.5, splash: 0.6, thunder: 0.8, ward: 0.5, wind: 0.45 };

const url = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

export class Sound {
  private music: HTMLAudioElement | null = null;
  private wantMusic: string | null = null;
  private unlocked = false;
  private fade: { from: number; to: number; t: number; seconds: number; stop: boolean } | null = null;
  private musicLevel = 1;

  /** Master volume, 0..1 (the setting). */
  volume = 0.8;

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  /** Starts a looping piece (now, or once sound is allowed). */
  playMusic(path: string): void {
    this.wantMusic = path;
    if (!this.unlocked) return;
    if (!this.music) {
      this.music = new Audio(url(path));
      this.music.loop = true;
    }
    this.musicLevel = 0;
    this.fadeMusic(1, 2.5);
    this.music.volume = 0;
    void this.music.play().catch(() => undefined);
  }

  /** Fades the music to `level` (0..1) over `seconds`; to 0 with `stop` it ends. */
  fadeMusic(level: number, seconds: number, stop = false): void {
    if (stop) this.wantMusic = null;
    this.fade = { from: this.musicLevel, to: level, t: 0, seconds, stop };
  }

  play(effect: Effect, level = 1): void {
    if (!this.unlocked || this.volume <= 0) return;
    const a = new Audio(url(`title/sfx/${effect}.mp3`));
    a.volume = Math.min(1, this.volume * MIX[effect] * level);
    void a.play().catch(() => undefined);
  }

  /** Called every frame: runs the music's fades. */
  tick(dt: number): void {
    const f = this.fade;
    if (f) {
      f.t = Math.min(f.seconds, f.t + dt);
      this.musicLevel = f.from + (f.to - f.from) * (f.seconds > 0 ? f.t / f.seconds : 1);
      if (f.t >= f.seconds) {
        this.fade = null;
        if (f.stop) this.music?.pause();
      }
    }
    if (this.music) this.music.volume = Math.min(1, this.volume * 0.6 * this.musicLevel);
  }
}
