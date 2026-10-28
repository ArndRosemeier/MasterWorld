import { WorkerPool } from '../workers/pool';

/**
 * The hitch log: every slow frame, with what took its time. The game loop marks its parts (`part('towns')`);
 * a frame that took longer than `over` ms is kept with the parts that cost most, the time spent outside the
 * loop before it (the browser: garbage collection, worker answers, timers, waiting for the GPU), the worker
 * answers and long tasks that fell in that time, the shader builds in it, and how far the heap shrank (a
 * garbage collection). Read in the debug menu (Show: Hitch log) or `game.hitches.report()`.
 */

/** One slow frame. */
export interface Hitch {
  /** When it began, ms since the page opened. */
  readonly t: number;
  /** Start to start, ms. */
  readonly ms: number;
  /** Inside the game loop, ms, and its parts, costliest first. */
  readonly loop: number;
  readonly parts: readonly (readonly [string, number])[];
  /** After the loop, ms: the browser's own work until the next frame (GC, worker answers, timers, the GPU). */
  readonly outside: number;
  /** What else was seen in this frame's time: worker answers, long tasks, shader builds, notes. */
  readonly seen: string[];
  /** Heap freed since the frame before, MB (a garbage collection), when the browser tells. */
  readonly freedMb: number;
}

export interface Shaders { readonly events: readonly { readonly t: number; readonly ms: number; readonly what: string; readonly kind: string }[] }

const KEEP = 200;

export class HitchLog {
  /** A frame longer than this (ms) is kept. */
  over = 50;
  readonly hitches: Hitch[] = [];
  /** Frames seen, and the slow ones among them. */
  frames = 0;
  private start = -1;
  private ended = -1;
  private at = 0;
  private label = '';
  private parts = new Map<string, number>();
  private seen: { t: number; what: string; ms?: number }[] = [];
  private shaderSeen = 0;
  private heap = 0;

  constructor(private readonly clock: () => number = performance.now.bind(performance), public shaders: Shaders | null = null, private readonly heapNow: () => number = heapUsed) {}

  /** The loop starts a frame: the frame before it is closed (kept if slow). */
  startFrame(): void {
    const t = this.clock();
    if (this.start >= 0) this.close(t);
    this.frames++;
    this.start = this.at = t;
    this.label = '';
    this.parts.clear();
  }

  /** The time since the last mark goes to `label`'s part (one call before each part). */
  part(label: string): void {
    const t = this.clock();
    if (this.label) this.parts.set(this.label, (this.parts.get(this.label) ?? 0) + t - this.at);
    this.label = label;
    this.at = t;
  }

  /** The loop is done with this frame. */
  endFrame(): void {
    this.part('');
    this.ended = this.clock();
  }

  /** Something that happened now (a worker answer, a long task, a place built): shown with the frame it fell in. */
  note(what: string, ms?: number, t = this.clock()): void {
    // Told late (the browser reports a long task after it): to the slow frame it fell in, if one was kept.
    if (t < this.start) {
      let h: Hitch | undefined;
      for (let i = this.hitches.length - 1; i >= 0 && !h; i--) { const x = this.hitches[i]; if (t >= x.t && t < x.t + x.ms) h = x; }
      if (h) h.seen.push(`${what}${ms ? ` ${ms.toFixed(0)} ms` : ''}`);
      return;
    }
    this.seen.push({ t, what, ms });
    if (this.seen.length > 400) this.seen.splice(0, this.seen.length - 400);
  }

  private close(next: number): void {
    const ms = next - this.start, heap = this.heapNow(), freed = this.heap > 0 && heap > 0 ? Math.max(0, this.heap - heap) / 2 ** 20 : 0;
    this.heap = heap;
    // Start to start: the loop, then the browser's own work until the next frame (`outside`).
    const from = this.start, outside = this.ended >= this.start ? next - this.ended : 0;
    const ev = this.shaders?.events ?? [];
    if (this.shaderSeen > ev.length) this.shaderSeen = 0;
    const builds = ev.slice(this.shaderSeen).filter((e) => e.t >= from && e.t < next);
    this.shaderSeen = ev.length;
    if (ms < this.over) {
      this.seen = this.seen.filter((s) => s.t >= next);
      return;
    }
    const loop = [...this.parts.values()].reduce((a, b) => a + b, 0);
    const parts = [...this.parts].filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, v] as const);
    const seen = [
      ...counted(this.seen.filter((s) => s.t >= from && s.t < next)),
      ...builds.map((b) => `shader ${b.kind} ${b.ms.toFixed(1)} ms: ${b.what}`),
    ];
    this.seen = this.seen.filter((s) => s.t >= next);
    this.hitches.push({ t: this.start, ms, loop, parts, outside, seen, freedMb: freed });
    if (this.hitches.length > KEEP) this.hitches.splice(0, this.hitches.length - KEEP);
  }

  /** The slow frames as lines, newest last; `n` the last few only. */
  lines(n = KEEP): string[] {
    const list = this.hitches.slice(-n);
    const out = list.map((h, i) => {
      const gap = i > 0 ? ` (+${((h.t - list[i - 1].t) / 1000).toFixed(1)} s)` : '';
      const parts = h.parts.map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
      const bits = [`${(h.t / 1000).toFixed(1)} s${gap}: ${h.ms.toFixed(0)} ms`, `loop ${h.loop.toFixed(0)}${parts ? ` [${parts}]` : ''}`, `outside ${h.outside.toFixed(0)}`];
      if (h.freedMb >= 1) bits.push(`GC ~${h.freedMb.toFixed(0)} MB freed`);
      if (h.seen.length) bits.push(h.seen.join('; '));
      return bits.join(' · ');
    });
    return out;
  }

  report(n?: number): string {
    const l = this.lines(n);
    return `${this.hitches.length} slow frames (over ${this.over} ms) of ${this.frames}${l.length ? `\n${l.join('\n')}` : ''}`;
  }

  clear(): void { this.hitches.length = 0; this.frames = 0; }
}

/** The same thing seen a few times in a frame, counted once ("worker terrain:chunk ×3, 12 ms"). */
function counted(list: readonly { what: string; ms?: number }[]): string[] {
  const m = new Map<string, { n: number; ms: number }>();
  for (const s of list) { const e = m.get(s.what) ?? { n: 0, ms: 0 }; e.n++; e.ms += s.ms ?? 0; m.set(s.what, e); }
  return [...m].map(([what, e]) => `${what}${e.n > 1 ? ` ×${e.n}` : ''}${e.ms > 0 ? ` ${e.ms.toFixed(0)} ms` : ''}`);
}

/** The JS heap in use, bytes (Chrome only; 0 elsewhere). */
function heapUsed(): number {
  return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
}

/** The one hitch log of the page, read by the loop, the worker pools and the debug menu. */
export const HITCHES = new HitchLog();

/** Worker answers, long tasks (over 50 ms, as the browser sees them) and shader builds go into the log too. */
export function watchHitches(shaders: Shaders, log: HitchLog = HITCHES): void {
  log.shaders = shaders;
  WorkerPool.heard = (what) => log.note(what);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) log.note('long task', e.duration, e.startTime);
    }).observe({ type: 'longtask', buffered: false });
  } catch { /* not in this browser */ }
}
