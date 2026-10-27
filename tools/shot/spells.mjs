/**
 * Each school's first spell (implementation plan C2): `node tools/shot/spells.mjs [out dir]` after `npm run build`
 * (and `npm run packs`: the wolves), SHOT_GPU=1 on the reference machine. One page: the hero 11 m from the wolves
 * out on the land at mid-morning, then for each school of magic its first spell is learned (the debug menu's
 * way, which opens the school), the mana filled, a wolf picked with Tab and the spell cast; the picture is taken
 * once the spell shows (in flight, bursting or flaring), the spells' drawing held still for it. JPEGs into
 * `<out dir>` (default `shots/spells/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
/** More of the page's query (SwiftShader in the cloud: `&trees=0` for a quicker load). */
const EXTRA = process.env.SPELLS_QUERY ?? '';
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/spells', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}${EXTRA}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await meet('wolves', 11)(page);
await page.waitForTimeout(2000);

// The first spell of every school, in the setting's order (taught, level 0, a magic skill).
const firsts = await page.evaluate(() => {
  const g = window.game, setting = g.setting;
  const magic = setting.skills.filter((s) => s.group === 'magic').map((s) => s.id);
  return magic.map((k) => setting.abilities.find((a) => a.skill === k && (a.level ?? 0) === 0)?.id).filter(Boolean);
});
let failed = false;
for (const [i, id] of firsts.entries()) {
  await page.evaluate((id) => {
    const g = window.game, h = g.character;
    g.spellView.frozen = false;
    h.learn(id);
    h.mana = h.maxMana;
    h.health = h.maxHealth;
    h.cooldowns.clear();
  }, id);
  // Tab picks a wolf (the fight on the land leads once the hero is near the band).
  await page.waitForFunction(() => window.game.wild.encounters.some((e) => e.leading), null, { timeout: TIMEOUT });
  await page.keyboard.press('Tab');
  const why = await page.evaluate((id) => window.game.useAbility(id), id);
  if (why) { console.log(`${id}: ${why}`); failed = true; continue; }
  const shown = await page.waitForFunction(() => { const s = window.game.spellView.shown; return s.shots > 0 || s.flashes > 0; }, null, { timeout: 20000 }).then(() => true, () => false);
  await page.evaluate(() => { window.game.spellView.frozen = true; });
  const file = join(dir, `${String(i + 1).padStart(2, '0')}-${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 92, timeout: TIMEOUT });
  console.log(`${file}${shown ? '' : ' (the spell never showed)'}`);
  if (!shown) failed = true;
  await page.evaluate(() => { window.game.spellView.frozen = false; });
  await page.waitForTimeout(1500);
}
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
