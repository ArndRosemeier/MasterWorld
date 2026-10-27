/**
 * A headless hero that clears a dungeon by script (plan 4.1: "measured, not hoped for"): it walks to the
 * nearest creature, targets it, fights with its belt (heavy blows when ready, a potion when low, second
 * wind) and goes on to the next, until the den is beaten or the hero falls. The checks use it to hold the
 * balance: what a fresh hero can take on, and that the dangerous places really are dangerous. With `loot`
 * it then searches every body and chest, goes to any other spots it was given (a pack left by a fall) and
 * climbs back to the ladder, as a player ends a visit (the evening's loop check, game/evening.ts). Pure.
 */
import type { SettingModule } from '../setting/contract';
import type { Cellar } from '../world/dungeon/cellar';
import { DungeonSpace } from '../world/dungeon/space';
import { Character } from './character';
import { Delve, type DelveSave } from './delve';
import type { Fight, HeroPose } from './fight';
import { aimsAtFoe } from './recipe';
import type { Creature } from '../sim/creatures';

export interface BotResult {
  readonly won: boolean;
  readonly seconds: number;
  /** Health left, 0..1. */
  readonly health: number;
  readonly kills: number;
  readonly potions: number;
  readonly spared: number;
}

/** A spot to walk to after the fight (cellar frame); `reached` runs once the hero stands there. */
export interface BotSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly reached: () => void;
}

export interface BotOptions {
  /** What an earlier visit left (the dead stay dead). */
  readonly saved?: DelveSave;
  /** Search the bodies and chests, go to `spots`, and climb out again. */
  readonly loot?: boolean;
  readonly spots?: readonly BotSpot[];
  /** Fights on without resting, potions or second wind (the loop check's reckless hero). */
  readonly rash?: boolean;
}

/** A whole visit: the fight's result, what was searched, and whether the hero got back to the ladder. */
export interface DelveRun extends BotResult {
  readonly delve: Delve;
  /** Bodies and chests searched that held something. */
  readonly looted: number;
  /** Back at the ladder with nothing left to do. */
  readonly out: boolean;
  /** Where the hero stood at the end (cellar frame): where they fell, if they did. */
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
  /** The spells that went off (ability ids, each time). */
  readonly spells: readonly string[];
}

/**
 * A known spell to cast now, tried until the fight takes one: the hero's own (a heal, a ward) when hurt,
 * else one at the foe (the fight refuses it out of range or sight). Null: none fits.
 */
function castNow(hero: Character, setting: SettingModule, fight: Fight): string | null {
  for (const a of setting.abilities) {
    const mana = a.cost?.mana ?? 0;
    if (!mana || mana > hero.mana || !hero.knows(a.id) || fight.recipes.cooling(a.id) > 0) continue;
    if (!aimsAtFoe(a) && hero.health > hero.maxHealth * 0.7) continue;
    if (fight.use(a.id) === null) return a.id;
  }
  return null;
}

/** How near a spot counts as there, metres. */
const NEAR = 1.2;

export function fightBot(cellar: Cellar, setting: SettingModule, seed: number, hero = new Character(setting), limit = 900, opts: BotOptions = {}): DelveRun {
  const space = new DungeonSpace(cellar.layout);
  // A thorough player finds every key and door.
  for (const pl of cellar.layout.links) space.open.add(pl.link.id);
  // The way down took longer than any cooldown: the hero comes in fresh.
  hero.cooldowns.clear();
  const delve = new Delve(cellar, space, setting, hero, seed, opts.saved);
  const { den, fight } = delve;
  const h = cellar.hatch;
  const ladder = { x: h.x - Math.sin(h.yaw), y: h.y, z: h.z - Math.cos(h.yaw) };
  let { x, y, z } = ladder, yaw = h.yaw;
  let kills = 0, potions = 0, spared = 0, speed = 0, looted = 0;
  const spots = new Set(opts.spots ?? []);
  const dt = 0.1;
  let path: { x: number; y: number; z: number }[] = [], repath = 0, goal: object | null = null;
  /** What is being walked to for searching (kept until searched). */
  let aim: { x: number; y: number; z: number } | null = null;
  /** The foe being walked to (kept until it falls or a fight starts). */
  let chase: Creature | null = null;
  const spells: string[] = [];
  const run = (won: boolean, t: number, out = false): DelveRun => ({ won, seconds: t, health: hero.health / hero.maxHealth, kills, potions, spared, delve, looted, out, at: { x, y, z }, spells });
  /** One step along the nav towards a point (`key`: what is being walked to, so a new goal is routed at once). */
  const towards = (to: { x: number; y: number; z: number }, key: object): void => {
    repath -= dt;
    if (goal !== key || repath <= 0 || !path.length) {
      goal = key;
      const a = den.nav.at(x, y + 0.3, z), b = den.nav.at(to.x, to.y + 0.3, to.z);
      // Close by on the same floor: straight at it (the cells' centres can lead away from a foe in reach of a blow).
      const close = Math.hypot(to.x - x, to.z - z) < 3 && Math.abs(to.y - y) < 0.8;
      path = close ? [{ x: to.x, y: to.y, z: to.z }] : a && b ? [...den.nav.way(a, b, 80), { x: to.x, y: to.y, z: to.z }] : [];
      repath = close ? 0.2 : 0.5;
    }
    const p = path[0];
    if (!p) { speed = 0; return; }
    const dx = p.x - x, dz = p.z - z, dd = Math.hypot(dx, dz), k = Math.min(1, (4.5 * dt) / Math.max(dd, 1e-6));
    let next = den.nav.slide(x, y, z, dx * k, dz * k, 0.35);
    if (!next || Math.hypot(next.x - x, next.z - z) < 0.01) {
      // Caught in a corner: step back towards the middle of the cell.
      const here = den.nav.at(x, y + 0.3, z), m = here ? den.nav.centre(here) : null;
      next = m ? { x: x + (m.x - x) * 0.3, z: z + (m.z - z) * 0.3 } : null;
      repath = 0;
    }
    if (!next) { speed = 0; return; }
    x = next.x; z = next.z;
    if (Math.hypot(p.x - x, p.z - z) < 0.05) path.shift();
    y = space.floorAt(x, z, y + 0.6) ?? y;
    yaw = Math.atan2(-dx, -dz);
    speed = 4.5;
  };
  const standsBy = (p: { x: number; y: number; z: number }, r: number) => Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < 1.5;
  for (let t = 0; t < limit; t += dt) {
    const pose: HeroPose = { x, y, z, yaw, speed };
    for (const e of fight.advance(dt, pose)) {
      if (e.kind === 'killed') kills++;
      if (e.kind === 'spared') spared++;
      if (e.kind === 'fallen') return run(false, t);
      if (e.kind === 'recipe' && e.event.kind === 'went' && e.event.ability.cost?.mana) spells.push(e.event.ability.id);
    }
    if (den.beaten) {
      if (!opts.loot) return run(true, t);
      // Search whatever is in reach; then walk to the nearest thing left to search, a spot, or the ladder.
      const l = delve.within(pose);
      if (l) { if (delve.plunder(l)) looted++; continue; }
      const spot = [...spots].find((s) => standsBy(s, NEAR));
      if (spot) { spots.delete(spot); spot.reached(); continue; }
      const left = [
        ...den.dead.map((id) => den.creatures[id]).filter((c) => fight.bodies.has(c.id)),
        ...delve.hoards.filter((hd) => !delve.hasOpened(hd)),
        ...spots,
      ].sort((a, b) => Math.hypot(a.x - x, a.z - z, a.y - y) - Math.hypot(b.x - x, b.z - z, b.y - y));
      // Keep to the thing chosen until it is searched (two about as near, one up a stair, would make it dither).
      const pick = left.find((it) => it === aim) ?? left[0];
      aim = pick ?? null;
      const to = pick ?? ladder;
      if (!left.length && standsBy(ladder, NEAR)) return run(true, t, true);
      towards(to, to);
      continue;
    }
    // Nearest one that would fight (a begging one is left alone).
    const foes = den.alive.filter((c) => c.state !== 'meek' && c.state !== 'beg');
    // Keep to the one chosen while it is still there, unless another is fighting (two idle ones about as far,
    // their ways leading opposite ways, would make it dither between them).
    const nearest = foes.sort((a, b) => Math.hypot(a.x - x, a.z - z, a.y - y) - Math.hypot(b.x - x, b.z - z, b.y - y))[0];
    const foe: Creature | undefined = chase && foes.includes(chase) && !den.fighting.length ? chase : nearest;
    chase = foe ?? null;
    if (!foe) {
      // Only beggars left: go and hear them out (from afar they only cower, and the den is not beaten).
      const beggar = den.alive.find((c) => c.state === 'beg');
      if (beggar && Math.hypot(beggar.x - x, beggar.z - z) > 4) towards(beggar, beggar);
      else speed = 0;
      continue;
    }
    if (fight.target !== foe) fight.pick(foe);
    if (!opts.rash) {
      if (hero.health < hero.maxHealth * 0.35 && hero.remedy) { fight.drink(); potions++; }
      if (hero.health < hero.maxHealth * 0.55 && fight.recipes.cooling('breath') === 0) fight.use('breath');
      // Catch one's breath between fights.
      if (!den.fighting.length && hero.health < hero.maxHealth * 0.8 && fight.quiet > 2) { speed = 0; continue; }
    }
    // A mage stands still while a spell gathers, and casts what fits before closing in.
    if (fight.recipes.casting || castNow(hero, setting, fight)) { speed = 0; continue; }
    // Close enough that the blade lands (else step in: a foe can stand just outside it and still strike).
    const d = Math.hypot(foe.x - x, foe.z - z);
    if (d < Math.min(1.6, fight.reach(foe) - 0.05) && Math.abs(foe.y - y) < 1.2) {
      speed = 0;
      yaw = Math.atan2(-(foe.x - x), -(foe.z - z));
      if (!fight.attacking) fight.use('strike');
      if (fight.recipes.cooling('heavy') === 0 && hero.stamina > 40) fight.use('heavy');
      else if (fight.recipes.cooling('shove') === 0 && hero.stamina > 20 && den.fighting.length > 1) fight.use('shove');
      continue;
    }
    towards(foe, foe);
  }
  return run(false, limit);
}
