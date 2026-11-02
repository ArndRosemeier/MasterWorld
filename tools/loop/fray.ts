/**
 * The loop check's fights without the hero (phase R, D65): wolves come into the start town by night (the VGM's foray event) and
 * its watch and able folk meet them while the rest go indoors, with nobody of the town dying; and a wolf pack and a herd of deer
 * on open ground fight though no hero is near. Headless: the town, its people, the wild's creatures and the VGM's event are
 * the game's own (sim/townFight.ts, sim/creatures.ts). Also (R7): a hero met by highwaymen on the road pays a holdup once (the band
 * keeps its word) and refuses once (it fights, and says why). `node --import tsx tools/loop/fray.ts [seed...]`; run by `npm run loop`.
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

/** The road: highwaymen halt a hero, who pays them once and is let by, and refuses another band and is fought. */
function holdup(name: string): string | null {
  const seed = parseSeed(name);
  const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
  const hero = new Character(classic);
  hero.coins = 150;
  const meet = (x: number) => {
    const d = new Den(new OpenGround(flat, [{ x, z: 0, r: 0.01 }]), Array.from({ length: 3 }, () => ({ creature: 'highwayman', room: 0 })), classic.creatures, seed);
    d.creatures.forEach((c, i) => { c.x = x - i * 0.8; c.z = 0; });
    return new Delve(null, d, classic, hero, seed);
  };
  const pose = (x: number) => ({ x, y: 0, z: 0, yaw: 0, speed: 0 });
  const say = (d: Delve, secs: number, at: number): string[] => {
    const turns: string[] = [];
    for (let t = 0; t < secs; t += DT) for (const e of d.step(DT, pose(at), false)) if (e.kind === 'warn') turns.push(e.turn); else if (e.kind === 'break') turns.push(`break:${e.cause}`);
    return turns;
  };
  const a = meet(0);
  say(a, 6, 20);
  const terms = a.speak(), deal = a.speak();
  if (terms?.kind !== 'terms' || deal?.kind !== 'struck') return 'the holdup was not paid';
  if (hero.coins >= 150 || hero.coins < 150 * 0.5) return `the toll was not a share of the purse (${150 - hero.coins})`;
  const toll = 150 - hero.coins, after = say(a, 90, 4);
  if (a.den.fighting.length || after.some((t) => t.startsWith('break'))) return 'a band that was paid fought on';
  const b = meet(500);
  say(b, 6, 520);
  const refused = say(b, 20, 505);
  if (!refused.includes('break:patience') || b.den.fighting.length !== 3) return 'a refused holdup did not end in a fight';
  console.log(`  ${name}: paid ${toll} copper of 150 and was let by, not a word more in 90 s; refused the next band and it fought on ${refused.at(-1)}`);
  return null;
}

let failed = 0;
for (const name of seeds) {
  for (const [what, run] of [['a town fights off wolves', fray], ['creatures fight creatures', brawl], ['a holdup on the road', holdup]] as const) {
    console.log(`== ${name}: ${what}`);
    const why = run(name);
    if (why) { console.log(`FAILED: ${why}`); failed++; }
  }
}
console.log(failed ? `${failed} fray checks FAILED` : `all ${seeds.length * 3} fray checks passed`);
if (failed) process.exit(1);
