/**
 * The VGM's answers on the hero's way (implementation plan C9): `node tools/shot/sights.mjs [out dir]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. The hero stands out on the
 * land east of the start town; the VGM answers Discovery there three times and Reward once (a find, which
 * must go into the pack), each a walk further on, then Challenge (an ambush, seen from 14 m), then People (a traveller resting by the way, from 6 m), then situations (a hurt traveller, who cries out once seen; a raided farm's smoke from its fields, 80 m off): the hero steps up to 16 m of each (inside its glade), the game must say what it
 * is, and it is shot. JPEGs into `<out dir>` (default `shots/sights/<date>-<commit>/`). A slow check (docs/CHECKS.md),
 * well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { meet, standClear } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/sights', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
let failed = false;
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };

// Three answers to Discovery, then one to Reward (a find: the pack must grow when the hero comes upon it).
const NEEDS = ['discovery', 'discovery', 'discovery', 'reward'];
for (let i = 0; i < NEEDS.length; i++) {
  // Out on the land east of the start town, each time a walk further on.
  await page.evaluate((i) => {
    const g = window.game, d = g.towns.every[0].town.decision;
    g.player.teleport(d.x + d.radius + 260 + i * 450, undefined, d.z + 40, -Math.PI / 2);
  }, i);
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.game.character.pack.length + window.game.character.coins);
  const made = await page.evaluate((need) => {
    const m = window.game.answerNow(need);
    if (!m || m.decision.kind !== 'sight') return null;
    const d = m.decision, def = window.game.setting.sights.find((s) => s.id === d.sight);
    return { id: d.id, sight: d.sight, x: d.x, z: d.z, seen: def.seen, reason: m.reason, find: !!def.loot };
  }, NEEDS[i]);
  console.log(`answer ${i + 1}: ${made ? `${made.sight} ${made.id} (${made.reason})` : 'none'}`);
  if (!made) { failed = true; continue; }
  // From 16 m off, looking at it, inside its glade: the hero has come upon it, so the game says what it is.
  await page.evaluate(({ x, z }) => {
    const g = window.game, p = g.player.walker.pos, l = Math.max(1, Math.hypot(p.x - x, p.z - z));
    const hx = x + ((p.x - x) / l) * 16, hz = z + ((p.z - z) / l) * 16;
    g.player.teleport(hx, undefined, hz, Math.atan2(hx - x, hz - z));
  }, made);
  const said = await page.waitForFunction((seen) => document.body.innerText.includes(seen.slice(0, 30)), made.seen, { timeout: 8000 }).then(() => true, () => false);
  console.log(`came upon ${made.sight}: ${said ? 'said' : 'NOT SAID'}`);
  if (!said) failed = true;
  if (made.find) {
    const after = await page.evaluate(() => window.game.character.pack.length + window.game.character.coins);
    console.log(`the find: ${after > before ? 'taken' : 'NOTHING TAKEN'}`);
    if (after <= before) failed = true;
  }
  // The trees round it are gone once the workers have the glade.
  await page.waitForTimeout(3500);
  await shoot(`0${i + 1}-${made.sight}`);
  // Its words fade before the next one.
  await page.waitForTimeout(6000);
}
// Challenge's answer: an ambush lying in wait ahead, seen from 14 m.
await page.evaluate(() => {
  const g = window.game, d = g.towns.every[0].town.decision;
  g.player.teleport(d.x + d.radius + 260, undefined, d.z - 500, -Math.PI / 2);
});
await page.waitForTimeout(2500);
const ambush = await page.evaluate(() => { const m = window.game.answerNow('challenge'); return m ? `${m.decision.id}: ${m.reason}` : null; });
console.log(`ambush: ${ambush ?? 'none'}`);
if (!ambush) failed = true;
else {
  await meet('ambush', 14)(page);
  await page.waitForTimeout(2500);
  await shoot(`0${NEEDS.length + 1}-ambush`);
}
// People's answer: a town's traveller resting by the way, seen from 6 m before them; there the hero is
// with that town's people.
await page.evaluate(() => {
  const g = window.game, d = g.towns.every[0].town.decision;
  g.player.teleport(d.x - d.radius - 260, undefined, d.z + 500, Math.PI / 2);
});
// Long enough for the fight's last words to fade.
await page.waitForTimeout(7000);
const met = await page.evaluate(() => { const m = window.game.answerNow('people'); return m ? { id: m.decision.id, reason: m.reason, ...m.decision } : null; });
console.log(`traveller: ${met ? `${met.id}: ${met.reason}` : 'none'}`);
if (!met) failed = true;
else {
  const with_ = await page.evaluate((d) => {
    const g = window.game, x = d.x + Math.sin(d.yaw) * 6, z = d.z + Math.cos(d.yaw) * 6;
    g.player.teleport(x, undefined, z, Math.atan2(x - d.x, z - d.z));
    return g.towns.townAt(x, z)?.id ?? null;
  }, met);
  console.log(`with the people of ${with_ ?? 'NOBODY'}`);
  if (with_ !== met.town) failed = true;
  await page.waitForTimeout(2500);
  await shoot(`0${NEEDS.length + 2}-traveller`);
}
// A situation (C10): a hurt traveller by the way. Seen from 40 m first (no cry yet), then from 20 m, where
// they cry out in a speech bubble.
await page.evaluate(() => {
  const g = window.game, d = g.towns.every[0].town.decision;
  g.player.teleport(d.x - d.radius - 260, undefined, d.z - 600, Math.PI / 2);
});
await page.waitForTimeout(2500);
const hurt = await page.evaluate(() => { const m = window.game.situationNow('hurt-traveller'); return m ? { id: m.decision.id, ...m.decision } : null; });
console.log(`hurt traveller: ${hurt ? hurt.id : 'none'}`);
if (!hurt) failed = true;
else {
  const stand = (d) => page.evaluate(([h, d]) => {
    const g = window.game, x = h.x + Math.sin(h.yaw) * d, z = h.z + Math.cos(h.yaw) * d;
    g.player.teleport(x, undefined, z, Math.atan2(x - h.x, z - h.z));
  }, [hurt, d]);
  await stand(40);
  await page.waitForTimeout(1500);
  const early = await page.evaluate(() => window.game.speech.line);
  console.log(`from 40 m: ${early ?? 'no cry (seen first)'}`);
  if (early) failed = true;
  await stand(20);
  await page.waitForTimeout(1500);
  const cry = await page.evaluate(() => window.game.speech.line);
  console.log(`from 20 m: ${cry ?? 'NO CRY'}`);
  if (!cry) failed = true;
  // Up close for the picture, from a side with no trunk between (woods could hide them at 20 m).
  await standClear(page, hurt, 5);
  await page.waitForTimeout(1200);
  await shoot(`0${NEEDS.length + 3}-hurt-traveller`);
}
// A situation seen from afar (C10): a farm raided, its barn smoking over the trees, shot from its fields 80 m off, looking up.
const raid = await page.evaluate(() => window.game.storyEvent('farm-raid'));
console.log(`raid: ${raid}`);
await page.waitForTimeout(1500);
const smokeAt = await page.evaluate(() => {
  const g = window.game, e = g.log.filter((d) => d.kind === 'event' && d.paddock !== undefined).at(-1);
  if (!e) return null;
  const t = g.towns.get(e.town).town, pd = t.plan.paddocks[e.paddock], b = t.plan.buildings[t.plan.farms[pd.farm].barn];
  // Out in the farm's fields, away from the town, looking up at the column (from the woods near crowns
  // hide the sky; from the town its houses do).
  const [cx, cz] = t.plan.centre, l = Math.max(1, Math.hypot(b.cx - cx, b.cz - cz));
  const x = b.cx + ((b.cx - cx) / l) * 80, z = b.cz + ((b.cz - cz) / l) * 80;
  g.player.teleport(x, undefined, z, Math.atan2(x - b.cx, z - b.cz));
  const cam = g.player.heroCam;
  cam.yaw = g.player.walker.yaw;
  cam.pitch = 0.3;
  cam.zoom = 3;
  return { x: b.cx, z: b.cz };
});
console.log(`smoke: ${smokeAt ? `over the barn at ${smokeAt.x.toFixed(0)}, ${smokeAt.z.toFixed(0)}` : 'NO RAIDED FARM'}`);
if (!smokeAt) failed = true;
else {
  await page.waitForTimeout(6000);
  await shoot(`0${NEEDS.length + 4}-raid-smoke`);
}
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
