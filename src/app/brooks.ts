/**
 * Brook tiles for the main thread, traced in the world worker ahead of the hero (D50): tracing one takes
 * 0.2-0.3 s, too long for a frame (floor F2). A tile still missing when the land needs it is traced here.
 */
import type { Hydrology } from '../world/hydro';
import type { WorldJobs } from '../workers/pool';

/** How far round the hero brook tiles are fetched, metres (a tile is 32 km; the VGM looks about 3 km ahead). */
const AHEAD = 6000;

export class BrookPrefetch {
  private readonly asked = new Set<string>();
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(private readonly hydro: Hydrology, private readonly jobs: WorldJobs) {}

  /** Asks for the brook tiles within AHEAD of (x, z) that are not here yet. */
  near(x: number, z: number): void {
    const b = this.hydro.brooks;
    if (!b || Math.hypot(x - this.lastX, z - this.lastZ) < 250) return;
    this.lastX = x; this.lastZ = z;
    const side = b.core * b.cell;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const px = x + i * AHEAD, pz = z + j * AHEAD;
      if (this.hydro.hasBrooks(px, pz)) continue;
      const tx = Math.floor(px / side), tz = Math.floor(pz / side), key = `${tx},${tz}`;
      if (this.asked.has(key)) continue;
      this.asked.add(key);
      void this.jobs.brooks(tx, tz).then((packed) => this.hydro.adoptBrooks(tx, tz, packed));
    }
  }
}
