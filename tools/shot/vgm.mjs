/**
 * The VGM seen at work (a developer's aid): `node tools/shot/vgm.mjs [out dir]` after `npm run build`, SHOT_GPU=1 on
 * the reference machine. Out on the land east of the start town the VGM answers Discovery: its move must slide in
 * as a slip at the top right and its place must get a ward-blue stud on the minimap (01-alert). F9 opens its window
 * (02-window); its newest move's Go there puts the hero beside the place (03-there). JPEGs into `<out dir>`
 * (default `shots/vgm/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/vgm', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
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
const check = (ok, what) => { console.log(`${ok ? 'ok' : 'FAILED'}: ${what}`); if (!ok) failed = true; };

await page.evaluate(() => {
  const g = window.game, d = g.towns.every[0].town.decision;
  g.player.teleport(d.x + d.radius + 260, undefined, d.z + 40, -Math.PI / 2);
});
await page.waitForTimeout(2500);
const made = await page.evaluate(() => { const m = window.game.answerNow('discovery'); return m ? `${m.tool}: ${m.reason}` : null; });
console.log(`answer: ${made ?? 'none'}`);
check(!!made, 'the VGM answered Discovery');
await page.waitForTimeout(1500);
check(await page.locator('.vgm-slip').count() > 0, 'its move slid in as a slip');
check(await page.locator('#compass .stud.vgm').count() > 0, 'the minimap has a VGM stud');
await shoot('01-alert');

await page.keyboard.press('F9');
await page.waitForTimeout(1800);
check(await page.locator('.panel.vgm .move').count() > 0, 'F9 opened the VGM window with its moves');
await shoot('02-window');

await page.locator('.panel.vgm .move .go').first().click();
await page.waitForTimeout(3000);
await shoot('03-there');

console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(failed || errors.length ? 1 : 0);
