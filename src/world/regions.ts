/**
 * Regions (docs/design/masterworld-plan.md 5.5, D16): aligned squares of 250 m × 2^level forming a quadtree.
 * The VGM opens a region of the size that fits its content; where the square is partly taken by smaller
 * regions already open, the free rest is filled with the largest aligned squares that fit. Every aligned
 * square splits exactly into four aligned halves, so the cover never has gaps or overlaps.
 */

/** Side of the smallest region and of a streaming tile, metres. */
export const BASE = 250;
/** Largest level the map accepts (250 m × 2^16 ≈ 16 000 km). */
export const MAX_LEVEL = 16;

export interface RegionKey {
  readonly level: number;
  /** Grid index at this level: the square spans [x·size, (x+1)·size). */
  readonly x: number;
  readonly z: number;
}

export const sizeOf = (level: number): number => BASE * 2 ** level;
export const keyId = (k: RegionKey): string => `${k.level}:${k.x}:${k.z}`;

/** The region of a level containing a world point. */
export function keyAt(level: number, wx: number, wz: number): RegionKey {
  const s = sizeOf(level);
  return { level, x: Math.floor(wx / s), z: Math.floor(wz / s) };
}

export function parentOf(k: RegionKey): RegionKey {
  return { level: k.level + 1, x: Math.floor(k.x / 2), z: Math.floor(k.z / 2) };
}

export function childrenOf(k: RegionKey): RegionKey[] {
  if (k.level === 0) throw new Error('a 250 m region has no children');
  const l = k.level - 1, x = k.x * 2, z = k.z * 2;
  return [{ level: l, x, z }, { level: l, x: x + 1, z }, { level: l, x, z: z + 1 }, { level: l, x: x + 1, z: z + 1 }];
}

/** World-space bounds [minX, minZ, maxX, maxZ). */
export function boundsOf(k: RegionKey): [number, number, number, number] {
  const s = sizeOf(k.level);
  return [k.x * s, k.z * s, (k.x + 1) * s, (k.z + 1) * s];
}

/** The streaming tiles (level-0 squares) a region covers. */
export function tilesOf(k: RegionKey): RegionKey[] {
  const n = 2 ** k.level, out: RegionKey[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push({ level: 0, x: k.x * n + i, z: k.z * n + j });
  return out;
}

export interface Region<T> {
  readonly key: RegionKey;
  readonly data: T;
}

/** The open regions of the world. Pure data: the ledger replays `open` calls to rebuild it. */
export class RegionMap<T> {
  private readonly open_ = new Map<string, Region<T>>();
  /** Ids of squares that have at least one open region strictly inside them. */
  private readonly partly = new Set<string>();

  get count(): number { return this.open_.size; }

  get(k: RegionKey): Region<T> | undefined { return this.open_.get(keyId(k)); }

  all(): Region<T>[] { return [...this.open_.values()]; }

  /** The open region covering a world point, if any (searched from the smallest level up). */
  at(wx: number, wz: number): Region<T> | undefined {
    for (let l = 0; l <= MAX_LEVEL; l++) {
      const r = this.open_.get(keyId(keyAt(l, wx, wz)));
      if (r) return r;
    }
    return undefined;
  }

  /** Whether this square or a square containing it is open. */
  private covered(k: RegionKey): boolean {
    for (let c: RegionKey = k; c.level <= MAX_LEVEL; c = parentOf(c)) if (this.open_.has(keyId(c))) return true;
    return false;
  }

  /**
   * The free parts of a square as the largest aligned squares: the square itself when nothing in it is
   * open, nothing when it is covered, otherwise the free parts of its four children.
   */
  freeParts(k: RegionKey): RegionKey[] {
    if (this.covered(k)) return [];
    if (!this.partly.has(keyId(k))) return [k];
    return childrenOf(k).flatMap((c) => this.freeParts(c));
  }

  /**
   * Open a region. If the square is free it opens whole and `[key]` is returned. If smaller regions inside
   * it are open already, the free rest is opened in the largest aligned squares (each with `fill(key)`) and
   * those keys are returned. A square already covered by an open region cannot be opened.
   */
  open(k: RegionKey, data: T, fill: (part: RegionKey) => T = () => data): RegionKey[] {
    if (k.level < 0 || k.level > MAX_LEVEL || !Number.isInteger(k.level) || !Number.isInteger(k.x) || !Number.isInteger(k.z)) throw new Error(`bad region key ${keyId(k)}`);
    if (this.covered(k)) throw new Error(`region ${keyId(k)} is already covered`);
    const parts = this.freeParts(k);
    const whole = parts.length === 1 && parts[0] === k;
    for (const p of parts) this.put(p, whole ? data : fill(p));
    return parts;
  }

  private put(k: RegionKey, data: T): void {
    this.open_.set(keyId(k), { key: k, data });
    for (let c = parentOf(k); c.level <= MAX_LEVEL; c = parentOf(c)) {
      const id = keyId(c);
      if (this.partly.has(id)) break;
      this.partly.add(id);
    }
  }
}
