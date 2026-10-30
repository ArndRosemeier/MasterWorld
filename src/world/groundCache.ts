/**
 * The ground's height for what only needs its feet to look right (birds, the wild's creatures, a hold's
 * wardens): read off a fine grid of exact heights, kept as they are asked for, between them bilinear.
 * The land's height is a deep stack of noise (world/terrain.ts, world/skeleton.ts): asked every frame for
 * every bird and every foot it was most of the garbage collected in a fight, and a good part of small life's
 * time. A bird standing, a warden at their post, a wolf trotting ask the same few corners frame after frame.
 * Kept until the land changes (`version`: a road laid, a town founded). Pure.
 */

/** Grid step, metres: a quarter metre keeps the land's finest relief (and a step's edge to a hand's width). */
const STEP = 0.25;
/** Corners kept (a power of two): some thousands, enough for everything near the hero. */
const SIZE = 1 << 14;

export class GroundCache {
  private readonly ix = new Int32Array(SIZE);
  private readonly iz = new Int32Array(SIZE);
  private readonly h = new Float64Array(SIZE);
  /** The generation each slot was filled in (0: never); a new generation empties them all at once. */
  private readonly gen = new Uint32Array(SIZE);
  private now = 1;
  private seen: number;

  /** `height`: the exact height; `version`: changes whenever the land does. */
  constructor(private readonly height: (x: number, z: number) => number, private readonly version: () => number = () => 0) {
    this.seen = version();
  }

  /** The height at (x, z), metres: bilinear between the exact heights of the grid's corners round it. */
  footing(x: number, z: number): number {
    const v = this.version();
    if (v !== this.seen) { this.seen = v; this.clear(); }
    const fx = x / STEP, fz = z / STEP, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
    const a = this.kept(i, j), b = this.kept(i + 1, j), c = this.kept(i, j + 1), d = this.kept(i + 1, j + 1);
    return (a + (b - a) * u) * (1 - w) + (c + (d - c) * u) * w;
  }

  /** Forget every height kept. */
  clear(): void {
    if (++this.now === 0xffffffff) { this.gen.fill(0); this.now = 1; }
  }

  private kept(i: number, j: number): number {
    const k = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) & (SIZE - 1);
    if (this.gen[k] === this.now && this.ix[k] === i && this.iz[k] === j) return this.h[k];
    const h = this.height(i * STEP, j * STEP);
    this.gen[k] = this.now; this.ix[k] = i; this.iz[k] = j; this.h[k] = h;
    return h;
  }
}
