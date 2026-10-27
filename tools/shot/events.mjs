/**
 * A story event (implementation plan C6): `node tools/shot/events.mjs [out dir]` after `npm run build` (and
 * `npm run packs`), SHOT_GPU=1 on the reference machine. One page: once the VGM has promised its first
 * places, the debug menu's "a story event now" makes the dwellers of one come out onto the land; then the
 * journal with its new lead, the band roaming where the lead points, and the town's people gathering at the
 * market to talk it over. EVENT=<id> asks for that event of the setting's (EVENT=farm-raid: bandits raid a
 * farm; then also its paddock, short of the animals they drove off). JPEGs into `<out dir>` (default
 * `shots/events/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const EXTRA = process.env.EVENTS_QUERY ?? '';
const EVENT = process.env.EVENT ?? null;
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/events', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair${gl ? '&gl' : ''}${EXTRA}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
let failed = false;
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };

// The VGM promises its first places within moments of play; then an event from one of them.
const news = await page.waitForFunction((id) => { const r = window.game.storyEvent(id ?? undefined); return r !== 'nothing is due' && r; }, EVENT, { timeout: 60000, polling: 1000 }).then((h) => h.jsonValue(), () => null);
console.log(`event: ${news}`);
if (!news || news === 'no wild here') failed = true;
else {
  await page.waitForTimeout(1500);
  await shoot('01-news');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(1200);
  await shoot('02-journal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const kind = await page.evaluate(() => window.game.wild.territories.at(-1).def.id);
  await meet(kind, 13)(page);
  await page.waitForTimeout(2500);
  await shoot('03-band');
  // The market, from its edge: the town's people coming together.
  await page.evaluate(() => {
    const g = window.game, t = g.towns.every[0], [x, z] = t.town.plan.centre;
    g.player.teleport(x + 26, undefined, z, Math.PI / 2);
  });
  await page.waitForTimeout(20000);
  await shoot('04-market');
  // A raid's farm: its paddock from outside the gate, short of what was driven off.
  const pen = await page.evaluate(() => {
    const g = window.game, e = g.log.at(-1);
    if (e?.paddock === undefined) return null;
    const t = g.towns.get(e.town), pd = t.town.plan.paddocks[e.paddock], p = pd.poly;
    let cx = 0, cz = 0;
    for (let i = 0; i < p.length; i += 2) { cx += p[i] / (p.length / 2); cz += p[i + 1] / (p.length / 2); }
    const [gx, gz] = pd.gate, l = Math.max(1, Math.hypot(gx - cx, gz - cz)), x = gx + (gx - cx) / l * 10, z = gz + (gz - cz) / l * 10;
    g.player.teleport(x, undefined, z, Math.atan2(x - cx, z - cz));
    return { taken: e.taken, left: pd.animals - e.taken, grazing: t.herds?.animals.filter((a) => a.paddock === e.paddock).length };
  });
  if (pen) {
    console.log(`paddock: ${pen.taken} taken, ${pen.left} left, ${pen.grazing} grazing`);
    if (pen.grazing !== pen.left) failed = true;
    await page.waitForTimeout(4000);
    await shoot('05-paddock');
  }
}
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
