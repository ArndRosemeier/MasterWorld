/**
 * A headless hero that clears a dungeon by script (plan 4.1: "measured, not hoped for"): it walks to the
 * nearest creature, targets it, fights with its belt (heavy blows when ready, a potion when low, second
 * wind) and goes on to the next, until the den is beaten or the hero falls. The checks use it to hold the
 * balance: what a fresh hero can take on, and that the dangerous places really are dangerous. Pure.
 */
import { deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { Den } from '../sim/creatures';
import type { Cellar } from '../world/dungeon/cellar';
import { DungeonSpace } from '../world/dungeon/space';
import { Character } from './character';
import { Fight, type HeroPose } from './fight';

export interface BotResult {
  readonly won: boolean;
  readonly seconds: number;
  /** Health left, 0..1. */
  readonly health: number;
  readonly kills: number;
  readonly potions: number;
  readonly spared: number;
}

export function fightBot(cellar: Cellar, setting: SettingModule, seed: number, hero = new Character(setting), limit = 900): BotResult {
  const space = new DungeonSpace(cellar.layout);
  // A thorough player finds every key and door.
  for (const pl of cellar.layout.links) space.open.add(pl.link.id);
  const den = new Den(space, cellar.spawns, setting.creatures, deriveSeed(seed, 'den'));
  const fight = new Fight(hero, den, setting, seed);
  const h = cellar.hatch;
  let x = h.x - Math.sin(h.yaw), y = h.y, z = h.z - Math.cos(h.yaw), yaw = h.yaw;
  let kills = 0, potions = 0, spared = 0, speed = 0;
  const dt = 0.1;
  let path: { x: number; y: number; z: number }[] = [], repath = 0;
  for (let t = 0; t < limit; t += dt) {
    const pose: HeroPose = { x, y, z, yaw, speed };
    for (const e of fight.advance(dt, pose)) {
      if (e.kind === 'killed') kills++;
      if (e.kind === 'spared') spared++;
      if (e.kind === 'fallen') return { won: false, seconds: t, health: 0, kills, potions, spared };
    }
    if (den.beaten) return { won: true, seconds: t, health: hero.health / hero.maxHealth, kills, potions, spared };
    // Nearest one that would fight (a begging one is left alone).
    const foes = den.alive.filter((c) => c.state !== 'meek' && c.state !== 'beg');
    const near = foes.sort((a, b) => Math.hypot(a.x - x, a.z - z, a.y - y) - Math.hypot(b.x - x, b.z - z, b.y - y))[0];
    if (!near) { speed = 0; continue; }
    if (fight.target !== near) fight.pick(near);
    if (hero.health < hero.maxHealth * 0.35 && hero.remedy) { fight.drink(); potions++; }
    if (hero.health < hero.maxHealth * 0.55 && fight.cooling('breath') === 0) fight.use('breath');
    // Catch one's breath between fights.
    if (!den.fighting.length && hero.health < hero.maxHealth * 0.8 && fight.quiet > 2) { speed = 0; continue; }
    const d = Math.hypot(near.x - x, near.z - z);
    if (d < 1.6 && Math.abs(near.y - y) < 1.2) {
      speed = 0;
      yaw = Math.atan2(-(near.x - x), -(near.z - z));
      if (!fight.attacking) fight.use('strike');
      if (fight.cooling('heavy') === 0 && hero.stamina > 40) fight.use('heavy');
      else if (fight.cooling('shove') === 0 && hero.stamina > 20 && den.fighting.length > 1) fight.use('shove');
      continue;
    }
    repath -= dt;
    if (repath <= 0 || !path.length) {
      const a = den.nav.at(x, y + 0.3, z), b = den.nav.at(near.x, near.y + 0.3, near.z);
      path = a && b ? [...den.nav.way(a, b, 80), { x: near.x, y: near.y, z: near.z }] : [];
      repath = 0.5;
    }
    const p = path[0];
    if (!p) { speed = 0; continue; }
    const dx = p.x - x, dz = p.z - z, dd = Math.hypot(dx, dz), k = Math.min(1, (4.5 * dt) / Math.max(dd, 1e-6));
    let to = den.nav.slide(x, y, z, dx * k, dz * k, 0.35);
    if (!to || Math.hypot(to.x - x, to.z - z) < 0.01) {
      // Caught in a corner: step back towards the middle of the cell.
      const here = den.nav.at(x, y + 0.3, z), m = here ? den.nav.centre(here) : null;
      to = m ? { x: x + (m.x - x) * 0.3, z: z + (m.z - z) * 0.3 } : null;
      repath = 0;
    }
    if (!to) { speed = 0; continue; }
    x = to.x; z = to.z;
    if (Math.hypot(p.x - x, p.z - z) < 0.05) path.shift();
    y = space.floorAt(x, z, y + 0.6) ?? y;
    yaw = Math.atan2(-dx, -dz);
    speed = 4.5;
  }
  return { won: false, seconds: limit, health: hero.health / hero.maxHealth, kills, potions, spared };
}
