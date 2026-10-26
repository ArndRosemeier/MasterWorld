/** The full variety sweep over every kind of dungeon (plan 8.1): `npm run variety [-- count]`. A slow check, run in CI beside npm test. */
import { classic } from '../../src/setting/classic/index';
import type { DungeonTemplate } from '../../src/world/decisions';
import { checkVariety } from '../../src/world/dungeon/variety';

const count = Number(process.argv[2] ?? 1000);
let failed = false;
for (const kind of Object.keys(classic.dungeons) as DungeonTemplate[]) {
  const lore = classic.dungeons[kind];
  if (!lore) continue;
  const t0 = performance.now();
  const r = checkVariety(lore, count, 1, kind);
  console.log(`${r.count} ${kind}s in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const [k, v] of Object.entries(r.top)) console.log(`  ${k.padEnd(12)} ${String(r.distinct[k]).padStart(5)} distinct, most common ${(v.share * 100).toFixed(1)}%: ${v.value.slice(0, 70)}`);
  if (r.problems.length) {
    failed = true;
    console.log(`${r.problems.length} problems:`);
    for (const p of r.problems.slice(0, 40)) console.log(`  ${p}`);
  }
}
if (failed) process.exit(1);
console.log('no problems');
