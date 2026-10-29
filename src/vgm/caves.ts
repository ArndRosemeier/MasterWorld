/**
 * A cave in the cliffs (D57, Arnd: "a natural cave skill for the VGM; cliffs are ideal for that"): when
 * Discovery is overdue out on the land and a cliff stands near the hero (a mesa's wall), the VGM opens a
 * natural cave in it, a place of the setting's cliff kind (classic: `cave`). Most are lived in (the kind's
 * lore picks its dwellers), a share stand empty as sights (`CellarLore.empty`). The nearest town's people know
 * of it, as of any promised place. Pure.
 */
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
