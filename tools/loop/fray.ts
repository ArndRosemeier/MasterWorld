/**
 * The loop check's fights without the hero (phase R, D65): wolves come into the start town by night (the VGM's foray event) and
 * its watch and able folk meet them while the rest go indoors, with nobody of the town dying; and a wolf pack and a herd of deer
 * on open ground fight though no hero is near. Headless: the town, its people, the wild's creatures and the VGM's event are
 * the game's own (sim/townFight.ts, sim/creatures.ts). Also (D69, Z1): a bandit camp is passed outside its aggro radius, pulled with
 * its link, and leashed home. `node --import tsx tools/loop/fray.ts [seed...]`; run by `npm run loop`.
 * Exits 1 if a fight broke.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { openWorld } from '../../src/vgm/builder';
import { bandOf, nextEvent } from '../../src/vgm/events';
import { territoryOf, wildFor } from '../../src/vgm/wild';
import { Township } from '../../src/game/township';
import { TownFight, type TownFightEvent } from '../../src/sim/townFight';
import { Delve } from '../../src/game/delve';
import { Character } from '../../src/game/character';
import { Den, type DenEvent, type Quarry } from '../../src/sim/creatures';
import { opposed } from '../../src/sim/factions';
import { OpenGround, type Land } from '../../src/sim/wild';
import type { Decision } from '../../src/world/decisions';

const seeds = process.argv.length > 2 ? process.argv.slice(2) : ['masterworld', 'alpha', 'x4'];
const far: Quarry = { x: 1e5, y: 0, z: 1e5, noise: 0, light: 0, alive: true, guard: { defence: 0, armour: 0, open: false } };
const DT = 0.1, NIGHT = 22;

function fray(name: string): string | null {
  const seed = parseSeed(name), { terrain, log } = openWorld(seed, classic);
  const town = terrain.towns[0], d = town.decision;
  const hours = Math.ceil((classic.events!.find((e) => e.kind === 'foray')!.after + 1) / 24) * 24 + NIGHT;
  const wild = wildFor({ seed, log, towns: terrain.towns, terrain, hours: 0, setting: classic }, town).map(territoryOf).map((territory) => ({ town: d.id, territory, left: territory.members.length }));
  const e = nextEvent({ seed, log, towns: terrain.towns, terrain, hours, setting: classic, wild, inside: () => false, which: 'wolves-in-town' });
  if (!e) return 'no foray came into the start town by night';
  const township = new Township(town, { seed, setting: classic, log: () => [...log, e] as Decision[], hours: () => hours });
  const life = township.life;
  for (let s = 0; s < 120; s++) life.step(1, hours - 0.05 + s / 3600);
  const land: Land = { height: (x, z) => terrain.height(x, z), waterDepth: (x, z) => terrain.waterDepth(x, z), blocked: (x, z, r) => town.solid(x, z, r) };
  const posted = life.agents.filter((a) => a.post).length;
  const band = new Den(new OpenGround(land, [bandOf(e)]), e.members.map((creature) => ({ creature, room: 0 })), classic.creatures, e.seed);
  band.feud = (a, b) => opposed(classic, a, b);
  const fight = new TownFight(life, { x: d.x, z: d.z, radius: d.radius }, classic, land, seed);
  const events: (TownFightEvent | DenEvent)[] = [];
  let tick = 0;
  for (; tick < 600 / DT && !events.some((x) => x.kind === 'clear'); tick++) {
    life.step(DT, hours + tick * DT / 3600);
    band.neighbours = fight.den ? [fight.den] : [];
    events.push(...band.step(DT, far), ...fight.raidStep(DT, [band], far));
  }
  const muster = events.find((x) => x.kind === 'muster');
  if (!muster || muster.kind !== 'muster') return 'the town was not called out';
  if (events.some((x) => x.kind === 'died' && x.who.def.faction === 'watch')) return 'somebody of the town died';
  if (!events.some((x) => x.kind === 'clear')) return `the raid was not over after ${(tick * DT).toFixed(0)} s`;
  if (life.alarmed.size || life.agents.filter((a) => a.post).length !== posted) return 'the town did not go back to its day';
  const downed = events.filter((x) => x.kind === 'down').length;
  console.log(`  ${name}: ${band.creatures.length} wolves into ${d.id} at ${(hours % 24).toFixed(0)} h: ${muster.watch.length} watch and ${muster.able.length} able folk met them, ${downed} knocked down (all up again), over in ${(tick * DT).toFixed(0)} s, ${band.creatures.filter((c) => c.state === 'dead').length} wolves dead`);
  return null;
}

/** Creatures that fight each other with no hero near: a wolf pack and a herd of deer on open ground. */
function brawl(name: string): string | null {
  const seed = parseSeed(name);
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const den = (kind: string, n: number, x: number) => {
    const d = new Den(new OpenGround(flat, [{ x, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
    d.creatures.forEach((c, i) => { c.x = x + (i % 2) * 1.2; c.z = Math.floor(i / 2) * 1.2; });
    d.feud = (a, b) => opposed(classic, a, b);
    return d;
  };
  const wolves = den('wolf', 4, 0), deer = den('deer', 4, 9);
  deer.creatures[0].health = 6;
  wolves.neighbours = [deer];
  deer.neighbours = [wolves];
  let blows = 0, falls = 0;
  for (let t = 0; t < 60; t += DT) for (const e of [...wolves.step(DT, far), ...deer.step(DT, far)]) { if (e.kind === 'swing') blows++; if (e.kind === 'died') falls++; }
  if (!blows) return 'the wolves never went for the deer';
  console.log(`  ${name}: the wolves struck ${blows} blows at the deer, ${falls} fell, no hero near`);
  return null;
}

/**
 * A camp pulled (D69, Z1): a fresh hero runs past a bandit camp 2 m outside its aggro radius and nobody stirs; one step inside pulls the
 * camp and its link within 12 m, not the one farther off; the hero runs and the leash brings them home, whole again.
 */
function pull(name: string): string | null {
  const seed = parseSeed(name);
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const hero = new Character(classic);
  const posts = [[0, 0], [1.2, 0.6], [8, 0], [24, 0]] as const;
  const d = new Den(new OpenGround(flat, [{ x: 0, z: 0, r: 0.01 }]), posts.map(() => ({ creature: 'highwayman', room: 0 })), classic.creatures, seed);
  d.creatures.forEach((c, i) => { c.x = posts[i][0]; c.z = posts[i][1]; c.until = 1e9; });
  const delve = new Delve(null, d, classic, hero, seed);
  const r = d.aggroOf(d.creatures[0], delve.fight.quarry({ x: 0, y: 0, z: 0, yaw: 0, speed: 0 }));
  const go = (secs: number, at: (t: number) => readonly [number, number]) => {
    for (let t = 0; t < secs; t += DT) { const [x, z] = at(t); delve.step(DT, { x, y: 0, z, yaw: 0, speed: 7 }, false); }
  };
  go(20, (t) => [-40 + 4 * t, -(r + 2)]);
  if (d.fighting.length) return `running by ${r + 2} m off pulled ${d.fighting.length}`;
  go(1, () => [-r + 1, 0]);
  const pulled = d.creatures.map((c) => c.state === 'fight');
  if (pulled.join() !== 'true,true,true,false') return `one step inside pulled ${pulled.join()}`;
  d.creatures[0].health *= 0.5;
  go(30, (t) => [-r + 1 - 7 * t, 0]);
  // Back on their camp's ground (they chased the hero 40 m west), at ease, whole.
  const home = d.creatures.slice(0, 3).filter((c) => c.state === 'idle' && Math.hypot(c.x, c.z) < 16 && c.health === c.def.health).length;
  if (home !== 3) return `the leash brought ${home} of 3 home whole: ${d.creatures.map((c) => `${c.state} ${c.x.toFixed(1)},${c.z.toFixed(1)} ${c.health}/${c.def.health}`).join(' / ')}`;
  console.log(`  ${name}: ran by a camp ${r + 2} m off (radius ${r} m) and nobody stirred; one step in pulled 3 (their link 8 m off too), not the one 24 m off; the leash took all 3 home, whole`);
  return null;
}

/**
 * The giants (phase M, D67): the peaceful ones (a giant elk, a giant turtle) take no notice of a hero who walks right up to them, are
 * not afraid and strike no blow, nor does anyone strike them; struck, the elk fights back and does not run. A giant boar far out comes at the hero.
 */
function giants(name: string): string | null {
  const seed = parseSeed(name);
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const den = (kind: string, n: number, x: number) => {
    const d = new Den(new OpenGround(flat, [{ x, z: 0, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
    d.creatures.forEach((c, i) => { c.x = x + (i % 2) * 1.2; c.z = Math.floor(i / 2) * 1.2; });
    d.feud = (a, b) => opposed(classic, a, b);
    return d;
  };
  const hero = (x: number): Quarry => ({ x, y: 0, z: 0, noise: 0.6, light: 0, alive: true, guard: { defence: 20, armour: 1, open: false } });
  // The peaceful: a hero walks right up to them, wolves lie beside the elk; no blow is struck by or at a great beast, none notices, shies or flees.
  const elk = den('giant elk', 1, 0), turtle = den('giant turtle', 1, 60), wolves = den('wolf', 3, 9);
  elk.neighbours = [wolves]; wolves.neighbours = [elk];
  let blows = 0, noticed = 0;
  for (let t = 0; t < 120; t += DT) {
    const at = Math.max(1, 40 - t * 0.6);
    for (const e of [...elk.step(DT, hero(at)), ...turtle.step(DT, hero(60 + Math.max(1, 40 - t * 0.6))), ...wolves.step(DT, far)]) {
      if (e.kind === 'swing' && (e.who.def.faction === 'great' || e.who.def.faction === 'predators')) blows++;
      if ((e.kind === 'flee' || e.kind === 'notice' || e.kind === 'alarm') && e.who.def.faction === 'great') noticed++;
    }
    for (const c of [...elk.creatures, ...turtle.creatures]) if (c.state !== 'idle') return `${c.def.name} was ${c.state} with a hero beside it (${t.toFixed(0)} s)`;
  }
  if (blows) return `a great beast was struck at or struck: ${blows} blows`;
  if (noticed) return `the peaceful giants took notice of a hero: ${noticed} events`;
  // Struck, the elk fights back (it does not run), and keeps on until it is hurt past its health.
  const giant = elk.creatures[0];
  elk.wound(giant, { outcome: 'hit', damage: 3 }, { x: giant.x + 3, y: 0, z: 0 });
  for (let t = 0; t < 4; t += DT) elk.step(DT, hero(giant.x + 3));
  if (giant.state !== 'fight') return `the struck giant elk did not fight back (${giant.state})`;
  // The hunters: a giant boar notices a hero close by and fights.
  const boar = den('giant boar', 1, 500);
  let fought = false;
  for (let t = 0; t < 30 && !fought; t += DT) { boar.step(DT, hero(510)); fought = boar.fighting.length > 0; }
  if (!fought) return 'the giant boar never went for the hero';
  console.log(`  ${name}: a hero walked up to the giant elk and turtle and they took no notice; struck, the elk fought back; the giant boar went for the hero`);
  return null;
}

let failed = 0;
for (const name of seeds) {
  for (const [what, run] of [['a town fights off wolves', fray], ['creatures fight creatures', brawl], ['a camp pulled, linked and leashed', pull], ['giants: the peaceful take no notice, the struck one fights, the boar hunts', giants]] as const) {
    console.log(`== ${name}: ${what}`);
    const why = run(name);
    if (why) { console.log(`FAILED: ${why}`); failed++; }
  }
}
console.log(failed ? `${failed} fray checks FAILED` : `all ${seeds.length * 4} fray checks passed`);
if (failed) process.exit(1);
