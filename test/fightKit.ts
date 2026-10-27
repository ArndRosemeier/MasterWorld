/** A goblins' cellar fight for tests: the hero (wearing `gear`) on a free spot near the first creature, in its sight. */
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import type { Item } from '../src/game/items';
import { Delve } from '../src/game/delve';
import { outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSpace } from '../src/world/dungeon/space';

export function cellarFight(seed: number, near = 2.5, gear: readonly Item[] = []) {
  const c: Cellar = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar)).find((x) => x.dweller.id === 'goblins')!;
  const space = new DungeonSpace(c.layout);
  for (const pl of c.layout.links) space.open.add(pl.link.id);
  const hero = new Character(classic);
  for (const it of gear) { hero.pack.push(it); hero.equip(it); }
  const d = new Delve(c, space, classic, hero, seed);
  const foe = d.den.creatures[0];
  // A free spot `near` metres from it, with a clear line to it.
  const free = Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2).map((a) => ({ x: foe.x + Math.cos(a) * near, y: foe.y, z: foe.z + Math.sin(a) * near }))
    .find((p) => d.den.ground.clearance(p.x, p.y + 0.8, p.z) > 0.4 && d.den.ground.sees(p.x, p.y, p.z, foe.x, foe.y, foe.z, 1.2))!;
  const pose = { ...free, yaw: 0, speed: 0 };
  return { d, hero, foe, pose };
}
