/**
 * A cave in the cliffs (D57, Arnd: "a natural cave skill for the VGM; cliffs are ideal for that"): when
 * Discovery is overdue out on the land and a cliff stands near the hero (a mesa's wall), the VGM opens a
 * natural cave in it, a place of the setting's cliff kind (classic: `cave`). Most are lived in (the kind's
 * lore picks its dwellers), a share stand empty as sights (`CellarLore.empty`). The nearest town's people know
 * of it, as of any promised place. Pure.
 */
import type { CavesDef } from '../setting/contract';
import { deriveSeed, hash2f } from '@futuremagic/core';
import { rockFor, sharesFor, sizeFor, type CaveShares } from '../world/cave/choose';
import type { DungeonDecision } from '../world/decisions';
import { siteInCliff } from '../world/dungeon/caveMouth';
import type { NeedContext } from './answers';
import { dungeonFor, farFrom } from './dungeons';
import { openPromises } from './leads';
import { seesOver } from '../world/sight';

/** How far from the hero (m) the VGM looks for a cliff to open a cave in. */
const RING: readonly [number, number] = [120, 450];
/** No new cave while an open one lies this near the hero (m): one at a time. */
const NEAR = 700;
/** How far round the hero (m) the open caves are counted against `noticing.caves.most`. */
const OPEN_ROUND = 2500;
/** Seeded looks for a cave ahead of the hero in view, at the most. */
const LOOKS = 16;
/** A cave keeps this far from a town's edge (m). */
const OFF_TOWN = 120;

/**
 * The cave the VGM opens in a cliff near the hero, or null (no cliff kind, no cliff near, one open nearby). With the setting's `noticing`
 * (D66, K9) it stands ahead of the hero on their way (70 to 260 m, within the spread of it), in view of them, its mouth turned towards
 * them: the hero comes on it, and the map marks it when they have seen it; with no way known (`toward` none) no cave is opened.
 */
export function caveFor(c: NeedContext, apart = NEAR): DungeonDecision | null {
  const dungeons = c.setting.dungeons, kinds = cliffKinds(c);
  if (!kinds.length) return null;
  if (openPromises(c.log).some((p) => p.kind === 'dungeon' && kinds.includes(p.template) && p.site && Math.hypot(p.site.x - c.hero.x, p.site.z - c.hero.z) < apart)) return null;
  const town = [...c.towns].sort((a, b) => farFrom(a, c.hero) - farFrom(b, c.hero))[0];
  if (!town) return null;
  const n = c.setting.noticing, way = c.toward ? Math.atan2(c.toward.z - c.hero.z, c.toward.x - c.hero.x) : null;
  if (n && way === null) return null;
  // (Ahead of the hero a cliff that is also in view and faces them is rarer than any cliff: a few seeded looks are made, the first that fits is taken.)
  for (let look = 0; look < (n ? LOOKS : 1); look++) {
    const seed = look === 0 ? c.seed : deriveSeed(c.seed, 'cave-look', look);
    const d = dungeonFor({ purpose: 'lead', town, kinds, near: { x: c.hero.x, z: c.hero.z, ring: n ? n.ahead : RING, ahead: n && way !== null ? { yaw: way, spread: n.spread } : undefined } }, { seed, terrain: c.terrain, log: c.log, home: c.home ?? town.decision, dungeons });
    // Only a mouth in a cliff: a hillside cave is the Builder's promise to make, not this tool's.
    if (!d?.site || !siteInCliff((x, z) => c.terrain.height(x, z), d.site)) continue;
    if (c.towns.some((w) => farFrom(w, d.site!) < w.decision.radius + OFF_TOWN)) continue;
    if (n && !facesAndShows(c, d.site, n)) continue;
    return { ...d, at: c.hours };
  }
  return null;
}

/** The setting's kinds of place that stand in a cliff (classic: `cave`). */
const cliffKinds = (c: NeedContext): string[] => Object.keys(c.setting.dungeons).filter((k) => c.setting.dungeons[k]?.form.stands === 'cliff');

/**
 * Caves along a cliff the hero runs by (Arnd 2026-11-02: "a user running along a cliff has a very good chance to see one"; the Builder's
 * turn, whatever Discovery says): for every `cell` metres of their way a roll of `chance` from the seed, and on a hit the cave of `caveFor`
 * (ahead of them in a cliff, in view), at least `near` metres from any open one, and not while `most` stand open within 2.5 km. Null
 * without the setting's `noticing.caves` and a way known.
 */
export function cliffCaveFor(c: NeedContext): DungeonDecision | null {
  const n = c.setting.noticing?.caves;
  if (!n || !c.toward) return null;
  if (hash2f(deriveSeed(c.seed, 'cliff-cave'), Math.floor(c.hero.x / n.cell), Math.floor(c.hero.z / n.cell)) >= n.chance) return null;
  const kinds = cliffKinds(c);
  if (openPromises(c.log).filter((p) => p.kind === 'dungeon' && kinds.includes(p.template) && p.site && Math.hypot(p.site.x - c.hero.x, p.site.z - c.hero.z) < OPEN_ROUND).length >= n.most) return null;
  return caveFor(c, n.near);
}

/** Does the hero, where they stand, see the mouth at `site` over the ground, and from its open side (not from behind the cliff)? */
function facesAndShows(c: NeedContext, site: { readonly x: number; readonly z: number; readonly yaw: number }, n: NonNullable<NeedContext['setting']['noticing']>): boolean {
  const dx = c.hero.x - site.x, dz = c.hero.z - site.z, d = Math.hypot(dx, dz) || 1;
  // The way in goes (−sin yaw, −cos yaw); the hero stands out on the other side of the mouth.
  if ((dx * -Math.sin(site.yaw) + dz * -Math.cos(site.yaw)) / d > -0.2) return false;
  const low = (x: number, z: number) => c.terrain.height(x, z);
  return seesOver(low, c.hero.x, low(c.hero.x, c.hero.z) + n.eye, c.hero.z, site.x, low(site.x, site.z) + n.face, site.z);
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
