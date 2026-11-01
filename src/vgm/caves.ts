/**
 * A cave in the cliffs (D57, Arnd: "a natural cave skill for the VGM; cliffs are ideal for that"): when
 * Discovery is overdue out on the land and a cliff stands near the hero (a mesa's wall), the VGM opens a
 * natural cave in it, a place of the setting's cliff kind (classic: `cave`). Most are lived in (the kind's
 * lore picks its dwellers), a share stand empty as sights (`CellarLore.empty`). The nearest town's people know
 * of it, as of any promised place. Pure.
 */
import type { CavesDef } from '../setting/contract';
import { rockFor, sharesFor, sizeFor, type CaveShares } from '../world/cave/choose';
import type { DungeonDecision } from '../world/decisions';
import { siteInCliff } from '../world/dungeon/caveMouth';
import type { NeedContext } from './answers';
import { dungeonFor, farFrom } from './dungeons';
import { openPromises } from './leads';

/** How far from the hero (m) the VGM looks for a cliff to open a cave in. */
const RING: readonly [number, number] = [120, 450];
/** No new cave while an open one lies this near the hero (m): one at a time. */
const NEAR = 700;
/** A cave keeps this far from a town's edge (m). */
const OFF_TOWN = 120;

/** The cave the VGM opens in a cliff near the hero, or null (no cliff kind, no cliff near, one open nearby). */
export function caveFor(c: NeedContext): DungeonDecision | null {
  const dungeons = c.setting.dungeons, kinds = Object.keys(dungeons).filter((k) => dungeons[k]?.form.stands === 'cliff');
  if (!kinds.length) return null;
  if (openPromises(c.log).some((p) => p.kind === 'dungeon' && kinds.includes(p.template) && p.site && Math.hypot(p.site.x - c.hero.x, p.site.z - c.hero.z) < NEAR)) return null;
  const town = [...c.towns].sort((a, b) => farFrom(a, c.hero) - farFrom(b, c.hero))[0];
  if (!town) return null;
  const d = dungeonFor({ purpose: 'lead', town, kinds, near: { x: c.hero.x, z: c.hero.z, ring: RING } }, { seed: c.seed, terrain: c.terrain, log: c.log, home: c.home ?? town.decision, dungeons });
  // Only a mouth in a cliff: a hillside cave is the Builder's promise to make, not this tool's.
  if (!d?.site || !siteInCliff((x, z) => c.terrain.height(x, z), d.site)) return null;
  if (c.towns.some((w) => farFrom(w, d.site!) < w.decision.radius + OFF_TOWN)) return null;
  return { ...d, at: c.hours };
}

/** A story of this many rooms or more wants at least the size of the same index (small, medium, big): a tale of many rooms needs the halls. */
const ROOMS_FOR_SIZE: readonly number[] = [0, 9, 18];

/** What the VGM asks of the formed cave (D63, phase K6) for a cave place: which rock, how big, which shares, how dangerous. */
export interface CaveSpec {
  /** The rock setting's id (`CavesDef.rocks`). */
  readonly rock: string;
  /** The size's id (`CavesDef.sizes`). */
  readonly size: string;
  /** Built, water and lava shares of the cave; they add up to 1 and a pure cave is the norm. */
  readonly shares: CaveShares;
  /** The most danger the place may hold (the decision's, fixed by how far it lies from the start); none: anything. */
  readonly danger: number | undefined;
}

/**
 * The tool that asks for a formed cave (D51, D63): the rock the country holds, a size from the seed but at least big enough for
 * the story's rooms, and the three shares the land allows. `kind` is the land's kind of country at the mouth. Null when the
 * country holds no solution cave (moor, badlands): the old natural cave stands there until its own former comes (lava tubes K7, mines K8).
 */
export function caveSpecFor(caves: CavesDef, kind: string, d: Pick<DungeonDecision, 'seed' | 'danger'>, rooms: number): CaveSpec | null {
  const rock = rockFor(caves, kind, d.seed);
  if (!rock) return null;
  const seeded = Math.max(0, caves.sizes.indexOf(sizeFor(caves, d.seed)));
  let need = 0;
  for (let i = 0; i < caves.sizes.length; i++) if (rooms >= (ROOMS_FOR_SIZE[i] ?? Infinity)) need = i;
  return { rock: rock.id, size: caves.sizes[Math.max(seeded, need)].id, shares: sharesFor(caves, kind, d.seed), danger: d.danger };
}
