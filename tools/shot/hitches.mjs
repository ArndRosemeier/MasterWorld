/**
 * The hitch log after a go-to (src/app/hitchLog.ts): `node tools/shot/hitches.mjs [go-to label] [seconds]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Starts at the start town by day,
 * stands there `seconds` (default 20) for a baseline, runs the go-to (default Waystation), stands there as long,
 * and prints both hitch logs: every frame over 50 ms (HITCH_OVER) with what took its time. A slow check
 * (docs/CHECKS.md), about a minute.
 */
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const label = process.argv[2] ?? 'Waystation', secs = Number(process.argv[3] ?? 20), over = Number(process.env.HITCH_OVER ?? 50);

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&seed=${process.env.SHOT_SEED ?? 'masterworld'}${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.evaluate((o) => { window.game.hitches.over = o; window.game.hitches.clear(); }, over);
await page.waitForTimeout(secs * 1000);
console.log(`--- start town, ${secs} s\n${await page.evaluate(() => window.game.hitches.report())}`);
const said = await page.evaluate((l) => Promise.resolve(window.game.go(l)).then((r) => String(r), (e) => `THREW ${e}`), label);
console.log(`--- go to ${label}: ${said}`);
await page.waitForTimeout(3000);
await page.evaluate(() => window.game.hitches.clear());
await page.waitForTimeout(secs * 1000);
console.log(`--- ${label}, ${secs} s after (first 3 s not counted)\n${await page.evaluate(() => window.game.hitches.report())}`);
await browser.close();
await server.close();
