/**
 * The loop check meets the natural locks (D63, phase K6): in formed caves told a story, the game's own Walker comes to each lock of the
 * three kinds (a wedged boulder, a locked grate, stacked stones) from the near side and is held by it, does what the lock asks (pushes
 * the boulder out, picks up the key, lingers by the stones: `FormedSpace.touch`, as the visit calls it every frame), and walks through.
 * From the far side a boulder holds. A place where the walker passes the cave with no lock in it, and not with the lock open, is a
 * fault of the lock; a place where it cannot pass with no lock is the cave's own and is not counted.
 * `npm run loop:locks [-- seeds]` (`VERBOSE=1` lists every lock; `STRICT=1` exits 1 when a lock holds the hero that should let them by).
 */
import { classic } from '../../src/setting/classic/index';
import { Walker } from '../../src/game/walker';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';
import { outlineCellar } from '../../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../../src/world/dungeon/variety';
import { inhabit } from '../../src/vgm/inhabit';
import { lockSites, type CaveLock, type LockKind } from '../../src/world/cave/locks';
import { FormedSpace } from '../../src/sim/formedSpace';
import { fieldAt, type BrickField } from '../../src/world/dungeon/rockMesh';

const caves = classic.caves!, seeds = Number(process.argv[2] ?? 2);
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
/** Seconds of push at a lock, at most, and how far past its middle (m) counts as through. */
const PUSH = 6, THROUGH = 1;

/** Push a walker from `from` along the way through `l` (`dir` 1: from `a` to `b`) for up to PUSH s, touching as the visit does; true when it got through. */
function pass(space: FormedSpace, field: BrickField, l: CaveLock, dir: 1 | -1, from: { x: number; y: number; z: number }): boolean {
  const w = new Walker({
    height: () => from.y - 1000,
    rockSurface: (x, y, z) => space.sdf(x, y, z),
    waterLevel: () => null,
    rockHolds: () => true,
  });
  w.place(from.x, from.z, from.y + 0.02);
  const along = () => ((w.pos.x - l.x) * l.tx + (w.pos.z - l.z) * l.tz) * dir;
  const heading = Math.atan2(-l.tx * dir, -l.tz * dir);
  for (let t = 0; t < PUSH * 60; t++) {
    w.step({ forward: 1, strafe: 0, heading, walk: false, up: false, down: false }, 1 / 60);
    space.touch(w.pos.x, w.pos.y, w.pos.z, 1 / 60);
    if (along() > THROUGH) return true;
  }
  return false;
}

let faults = 0, counted = 0, skipped = 0;
const tally: Record<LockKind, { fine: number; held: number }> = { oneway: { fine: 0, held: 0 }, locked: { fine: 0, held: 0 }, secret: { fine: 0, held: 0 } };
for (const rock of ['massive', 'jointed', 'thin-bedded']) {
  for (let seed = 1; seed <= seeds; seed++) {
    const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), r = readFormed(c, caves, dressFormed(c, caves)), field = c.field as BrickField;
    for (let n = 1; n <= 16; n++) {
      const cellar = outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);
      const h = inhabit(cellar, field, r.reading, c.skeleton.throat), found = lockSites(h.cellar, field, r.reading, h.cells, caves.way);
      const homes = h.cellar.formed!.homes;
      for (const l of found) {
        const at = (k: number) => { const x = l.x - l.tx * k, z = l.z - l.tz * k; return { x, y: h.ground.floorAt(x, z, l.y + 0.6) ?? l.y, z }; };
        const near = at(2.2), far = at(-2.2);
        const mk = (locks: readonly CaveLock[]) => new FormedSpace(h.cellar.layout, field, h.ground, homes, undefined, locks);
        // The cave alone: can the walker come through here at all?
        if (!pass(mk([]), field, l, 1, near) || fieldAt(field, near.x, near.y + 1.1, near.z, -1) <= 0) { skipped++; continue; }
        counted++;
        const space = mk([l]);
        const problems: string[] = [];
        if (space.sdf(l.x, l.y + 1, l.z) >= 0) problems.push('a shut lock is not solid');
        let through = false;
        if (l.kind === 'oneway') {
          through = pass(space, field, l, 1, near);
          if (pass(mk([l]), field, l, -1, far)) problems.push('the boulder gave way from the far side');
        } else if (l.kind === 'locked') {
          if (pass(mk([l]), field, l, 1, near)) problems.push('the grate let the hero by without its key');
          const k = space.keyAt(l.key ?? l.a);
          space.touch(k[0], k[1], k[2], 0.1);
          through = pass(space, field, l, 1, near);
        } else through = pass(space, field, l, 1, near);
        if (!through) problems.push(`the hero did not get through (${l.kind}, ${l.width.toFixed(1)} m across)`);
        tally[l.kind][through ? 'fine' : 'held']++;
        if (problems.length) { faults++; console.log(`  ${rock} ${seed}/${n} link ${l.link}: ${problems.join('; ')}`); }
        else if (process.env.VERBOSE) console.log(`  ${rock} ${seed}/${n} link ${l.link}: ${l.kind}, ${l.width.toFixed(1)} m across, held and opened`);
      }
    }
  }
}
for (const k of Object.keys(tally) as LockKind[]) console.log(`${k}: ${tally[k].fine} locks opened and walked through, ${tally[k].held} not`);
console.log(`${counted} locks met (${skipped} places where the cave alone stopped the walker), ${faults} faults`);
if (faults && process.env.STRICT) process.exit(1);
console.log(process.env.STRICT ? 'the locks can be passed' : 'measured (STRICT=1 to hold the locks to it)');
