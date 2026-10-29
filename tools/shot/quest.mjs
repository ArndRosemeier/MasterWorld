/**
 * A master's deed (C14): `node tools/shot/quest.mjs [out dir]` after `npm run build` (and `npm run packs`),
 * SHOT_GPU=1 on the reference machine, muted (launch.mjs). One page: a hero known well enough who has opened
 * frost at the Undercroft goes to its keeper, who speaks of the old shape kept in a place the VGM makes for
 * it; the journal's page for it; the place on the land; then the deed told done (as the talk would), and the
 * hero's first change into a bird there: kneeling in the feathers, then the bird. JPEGs into `<out dir>`
 * (default `shots/quest/<date>-<commit>/`). Fails if the place was not made or bird form was not learned
 * from it. A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { standClear } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/quest', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };
let failed = false;

// A student of the Undercroft (a frost spell learned) of the level its keeper asks, before its keeper.
const asked = await page.evaluate(() => {
  const g = window.game, t = g.towns.every[0];
  const under = g.setting.guilds.find((x) => x.keeper === 'undercroft-keeper');
  g.character.gain(Math.max(0, g.setting.growth.xp[under.quest.level - 1] - g.character.xp));
  g.character.learn(g.setting.abilities.find((a) => a.school === 'cryomancy' && (a.level ?? 1) === 1).id);
  const a = t.life.agents.find((x) => x.person.trade === 'undercroft-keeper');
  if (!a) return null;
  g.player.teleport(a.x + 1.6, undefined, a.z, Math.PI / 2);
  g.services.get('lessons')(a);
  return g.log.filter((d) => d.kind === 'dungeon' && d.quest).at(-1) ?? null;
});
console.log(`deed: ${asked ? `${asked.template} ${asked.id}` : 'none'}`);
if (!asked?.site) failed = true;
else {
  await page.waitForTimeout(1200);
  await shoot('01-keeper-asks');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(1200);
  await shoot('02-journal');
  await page.keyboard.press('Escape');
  // The place on the land, from in front of its door.
  const s = asked.site;
  await page.evaluate((s) => window.game.player.teleport(s.x - Math.sin(s.yaw) * 30, undefined, s.z - Math.cos(s.yaw) * 30, s.yaw), s);
  await page.waitForTimeout(6000);
  await standClear(page, { x: s.x, z: s.z, r: 8 }, 22, { pitch: -0.02 });
  await page.waitForTimeout(4000);
  await shoot('03-place');
  // Told done: the keeper's gift. Then the first change, out under the sky.
  const gift = await page.evaluate(() => { const g = window.game, id = g.questDone(); return { id, knows: g.character.knows('bird') }; });
  console.log(`done: ${gift.id}, bird form ${gift.knows ? 'learned' : 'NOT learned'}`);
  if (!gift.knows) failed = true;
  else {
    await page.waitForTimeout(3000);
    const said = await page.evaluate(() => { const b = window.game.birdForm; return b ? b.invoke() : 'no bird form'; });
    if (said) console.log(`bird form: ${said}`);
    await page.waitForTimeout(6000);
    await shoot('04-first-change');
    await page.waitForTimeout(12000);
    await shoot('05-bird');
    if (!(await page.evaluate(() => window.game.birdForm?.flying))) { console.log('the change did not end in a bird'); failed = true; }
  }
}
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { console.log(errors.join('\n')); failed = true; }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
