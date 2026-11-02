/**
 * The loop check's voyages (S4, plan 5.4; S7): in each world a hero buys passage from the start's harbour master, along
 * the coast and to the island promised in reach, goes
 * aboard the passage ship and stays on her deck the whole crossing, awake for the first part and then asleep in a
 * cabin bunk until she is about to come in, until her gangplank is down at the far harbour (walking a gangplank is
 * test/deck.test.ts's). Headless: the far town is
 * opened by the VGM and built before she comes in, her way keeps to deep water (no pier or shore under her hull), the
 * deck carries the hero through the sleep's jump in the clock, and at the far quay her gangplank reaches the land.
 * `node --import tsx tools/loop/voyage.ts [seed...]`; run by `npm run loop`. Exits 1 if a voyage broke.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { openWorld } from '../../src/vgm/builder';
import { farHarbourFor, seaWays, voyageOf, voyagesIn, type SeaWay } from '../../src/vgm/voyages';
import { islandFor } from '../../src/vgm/islands';
import type { VoyageDef } from '../../src/setting/contract';
import type { Terrain } from '../../src/world/terrain';
import { CLOCK } from '../../src/vgm/journeys';
import { settlementOf, type Decision, type RegionDecision, type TownDecision } from '../../src/world/decisions';
import { Decks, byBunk } from '../../src/world/deck';
import { farBerth, fleetOf, passageShip, voyageAfloat } from '../../src/world/fleet';
import { SEA_LEVEL } from '../../src/world/water';
import { Walker } from '../../src/game/walker';
import { shipFixtures } from '@futuremagic/settlement';

const seeds = process.argv.length > 2 ? process.argv.slice(2) : ['masterworld', 'alpha', 'x4'];
/** One frame of play (s), in game hours; the hero lies down this far into the crossing and wakes this long before she is in. */
const FRAME = 1 / 30, HOUR_PER_FRAME = (FRAME * CLOCK) / 3600, AWAKE = 0.5, WAKE = 0.28;
/** Her keel at bow and stern, as a share of her draft amidships. */
const ENDS = 0.8;

function voyage(name: string): string | null {
  const seed = parseSeed(name);
  const { terrain, log: first } = openWorld(seed, classic);
  const home = terrain.towns[0]?.decision, regions = classic.regions;
  if (!home?.harbour || !regions) return 'the start town has no harbour';
  const water = (x: number, z: number) => terrain.waterDepth(x, z);
  const def = classic.voyage!;
  // The harbour master's offer: the VGM opens a far harbour when none is in reach, and promises an island in reach
  // (S7); the Builder builds them.
  let log: Decision[] = [...first];
  const towns = () => terrain.towns.map((t) => t.decision);
  const opened: RegionDecision[] = [];
  for (const ask of [farHarbourFor, islandFor]) {
    const r = ask(def, { seed, log, terrain, regions, home, hero: home, hours: 9 }, home, towns(), water);
    if (r) { log = [...log, r]; terrain.settleMore([r]); opened.push(r); }
  }
  const ways = seaWays(def, seed, log, home, towns(), water);
  // (Some coasts have no other river's mouth in reach, so no harbour to sail to: then no ship takes passengers there.)
  const isle = ways.find((w) => w.isle), along = ways.find((w) => !w.isle);
  if (!along) console.log(`${name}: no harbour in reach along this coast; no passage offered`);
  if (opened.some((r) => !ways.some((w) => w.to === r.id))) return `a harbour opened across the water, ${opened.map((r) => r.id).join(', ')}, but no way by sea to it`;
  if (classic.world.islands && !isle) return 'no island promised in reach';
  for (const w of [along, isle]) {
    const e = w ? crossing(name, seed, terrain, log, home, w, def) : null;
    if (e) return e;
  }
  return null;
}

/** One crossing aboard the passage ship from `home` along way `w`, from casting off till her gangplank is down at the far quay. */
function crossing(name: string, seed: number, terrain: Terrain, log: readonly Decision[], home: TownDecision, w: SeaWay, def: VoyageDef): string | null {
  const t0 = performance.now(), regions = classic.regions!;
  const water = (x: number, z: number) => terrain.waterDepth(x, z);
  const farTown = terrain.town(w.to), far = farTown?.decision ?? (() => { const r = log.find((d) => d.id === w.to); return r?.kind === 'region' ? settlementOf(r, regions.fills) : null; })();
  if (!farTown?.plan.harbour || !far) return `the far town ${w.to} is not built`;
  const j = voyagesIn([voyageOf(log, home.id, w, 9)])[0].v;
  const ship = passageShip(fleetOf(terrain.town(home.id)!.plan.harbour!, home.seed ?? seed, water));
  if (!ship) return 'no passage ship';
  const plan = ship.mooring.plan, berth = farBerth(farTown.plan.harbour, far.seed ?? seed, plan);
  if (!berth) return `no berth at ${w.name}'s harbour takes her`;
  console.log(`${name}: passage to ${w.place}, ${(w.metres / 1000).toFixed(1)} km, ${w.hours.toFixed(1)} h, ${w.fare} copper`);

  // Aboard at her berth, by a cabin bunk, as she casts off.
  let walker: Walker | null = null;
  const decks = new Decks(() => walker?.pos ?? null);
  const hero = (walker = new Walker({
    height: (x, z) => terrain.height(x, z),
    rockSurface: () => null,
    waterLevel: (x, z) => (water(x, z) > 0 ? SEA_LEVEL : null),
    floor: (x, z, y) => decks.underfoot(x, z, y),
    wall: (x, z, rad, y) => decks.hull(x, z, rad, y ?? 0),
  }));
  const bunk = shipFixtures(plan).find((f) => f.kind === 'bed');
  if (!bunk) return 'no bunk aboard';
  const sail = (h: number) => {
    const at = voyageAfloat(j, ship.mooring, berth, h);
    if (!at) return null;
    const pose = { x: at.x, y: 0, z: at.z, ux: at.ux, uz: at.uz, pitch: 0, roll: 0 };
    decks.move('ship', plan, pose, at.berth ?? null, at.sailing);
    return { at, pose };
  };
  let now = j.at, s = sail(now)!;
  const lie = decks.worldOf('ship', bunk.a + 0.6 * Math.sign(-bunk.a), plan.deckY, bunk.b);
  if (!lie) return 'no deck';
  hero.place(lie.x, lie.z, lie.y);
  decks.boarded();
  let aground = 0, slept = false;
  const half = plan.length * 0.4;
  while (now < j.arrive + 0.3) {
    // Asleep: the clock runs on to just before she comes in, in one step, as the bunk's sleep does.
    if (!slept && now >= j.at + AWAKE) {
      const l = decks.riderOn();
      if (!l || !byBunk(plan, l.a, l.h, l.b)) return l ? `not by the bunk at a ${l.a.toFixed(1)} b ${l.b.toFixed(1)} h ${l.h.toFixed(1)}` : "not aboard as she sails";
      now = j.arrive - WAKE;
      slept = true;
    } else now += HOUR_PER_FRAME;
    s = sail(now)!;
    hero.step({ forward: 0, strafe: 0, heading: 0, walk: true, up: false, down: false }, FRAME);
    decks.boarded();
    if (decks.ship !== 'ship' || hero.mode === 'swim') return `off the ship at ${now.toFixed(2)} h`;
    // Under way, the water under her middle deep enough for her, and under bow and stern for their shallower keel there
    // (her ends rise): no pier, no shore under her hull.
    if (s.at.sailing) for (const k of [-1, 0, 1]) {
      const x = s.at.x + s.at.ux * half * k, z = s.at.z + s.at.uz * half * k;
      if (water(x, z) < plan.draft * (k ? ENDS : 1)) { aground++; if (process.env.VOYAGE_DEBUG) console.log(`  shallow at ${now.toFixed(3)} h, ${k ? 'an end' : 'her middle'} over ${water(x, z).toFixed(2)} m, ${Math.hypot(s.at.x - berth.x, s.at.z - berth.z).toFixed(0)} m from the far berth`); }
    }
  }
  if (aground) return `${aground} frames with her hull over shallows or a pier`;
  const plank = decks.plankOf('ship');
  if (!s.at.berth || !plank) return 'not at the far quay with her gangplank out';
  const footLand = Math.abs(plank.foot.y - berth.landY);
  if (footLand > 0.5) return `the gangplank's foot ${footLand.toFixed(2)} m off the quay`;
  console.log(`${name}: in at ${w.name}'s quay with the hero aboard, awake, her gangplank down on the quay (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return null;
}

let failed = 0;
for (const s of seeds) {
  const e = voyage(s);
  if (e) { failed++; console.log(`${s}: VOYAGE FAILED: ${e}`); }
}
process.exit(failed ? 1 : 0);
